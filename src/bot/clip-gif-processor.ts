import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import admin from "firebase-admin";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

import { convertMp4ToGif } from "@/lib/convertVideoToGif";
import { getAdminDb } from "@/lib/firebase-admin";

interface ClipDocumentData {
  videoUrl?: string;
  gifUrl?: string;
  gifStoragePath?: string;
  processingStatus?: "pending" | "processing" | "complete" | "error";
  storageDestination?: string;
  errorMessage?: string;
  durationSeconds?: number;
  [key: string]: unknown;
}

const activeListeners = new Map<string, () => void>();
const processingDocs = new Set<string>();

function getClipCollectionPath(guildId: string): string {
  const template = process.env.CLIP_COLLECTION_PATH_TEMPLATE;
  if (!template) {
    return `communities/${guildId}/clips`;
  }

  if (!template.includes("{guildId}")) {
    return template;
  }

  return template.replaceAll("{guildId}", guildId);
}

function getStorageDestination(guildId: string, docId: string, data: ClipDocumentData): string {
  if (typeof data.storageDestination === "string" && data.storageDestination.trim()) {
    return data.storageDestination;
  }

  if (typeof data.gifStoragePath === "string" && data.gifStoragePath.trim()) {
    return data.gifStoragePath;
  }

  const folder = process.env.GIF_STORAGE_FOLDER || "converted-clips";
  return `${folder}/${guildId}/${docId}.gif`;
}

function getBucket() {
  const storage = admin.storage();
  const bucketName = process.env.GIF_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;
  return bucketName ? storage.bucket(bucketName) : storage.bucket();
}

async function downloadMp4(sourceUrl: string, destinationPath: string): Promise<void> {
  const response = await fetch(sourceUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download clip: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await writeFile(destinationPath, Buffer.from(arrayBuffer));
}

async function updateDocWithError(doc: QueryDocumentSnapshot, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await doc.ref.update({
    processingStatus: "error",
    errorMessage: message,
    errorAt: FieldValue.serverTimestamp(),
  });
}

async function finalizeDoc(
  doc: QueryDocumentSnapshot,
  gifUrl: string,
  storagePath: string,
  durationSeconds: number,
) {
  await doc.ref.update({
    gifUrl,
    gifStoragePath: storagePath,
    durationSeconds,
    processingStatus: "complete",
    processedAt: FieldValue.serverTimestamp(),
    errorMessage: FieldValue.delete(),
    errorAt: FieldValue.delete(),
  });
}

async function markProcessing(doc: QueryDocumentSnapshot): Promise<ClipDocumentData | null> {
  const db = getAdminDb();
  const docRef = doc.ref;
  return await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(docRef);
    const data = snapshot.data() as ClipDocumentData | undefined;
    if (!data || !data.videoUrl) {
      return null;
    }

    if (data.gifUrl || data.processingStatus === "processing" || data.processingStatus === "complete") {
      return null;
    }

    transaction.update(docRef, {
      processingStatus: "processing",
      processingStartedAt: FieldValue.serverTimestamp(),
    });

    return data;
  });
}

async function processClipDoc(guildId: string, doc: QueryDocumentSnapshot) {
  const docKey = doc.ref.path;
  if (processingDocs.has(docKey)) {
    return;
  }

  const data = doc.data() as ClipDocumentData | undefined;
  if (!data || data.gifUrl || data.processingStatus === "complete") {
    return;
  }

  processingDocs.add(docKey);

  try {
    const originalData = await markProcessing(doc);
    if (!originalData) {
      return;
    }

    const videoUrl = originalData.videoUrl;
    if (!videoUrl) {
      await doc.ref.update({
        processingStatus: "error",
        errorMessage: "Missing videoUrl for conversion.",
        errorAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const tempDir = await mkdtemp(path.join(tmpdir(), "clip-"));
    const inputPath = path.join(tempDir, `${randomUUID()}.mp4`);
    const outputPath = path.join(tempDir, `${randomUUID()}.gif`);

    try {
      await downloadMp4(videoUrl, inputPath);
      const result = await convertMp4ToGif(inputPath, outputPath);

      const bucket = getBucket();
      const storageDestination = getStorageDestination(guildId, doc.id, originalData);
      const [uploadedFile] = await bucket.upload(outputPath, {
        destination: storageDestination,
        metadata: {
          cacheControl: "public,max-age=31536000,immutable",
          contentType: "image/gif",
        },
      });

      if (process.env.GIF_STORAGE_MAKE_PUBLIC !== "false") {
        await uploadedFile.makePublic().catch(() => {
          // Ignore errors here; signed URLs may be used instead if ACLs disallow public access.
        });
      }

      const publicUrl =
        process.env.GIF_PUBLIC_BASE_URL?.replaceAll("{path}", encodeURIComponent(storageDestination)) ??
        `https://storage.googleapis.com/${uploadedFile.bucket.name}/${encodeURI(storageDestination)}`;

      await finalizeDoc(doc, publicUrl, storageDestination, result.durationSeconds);
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {
        // Ignore cleanup errors.
      });
    }
  } catch (error) {
    console.error(`Failed to process clip ${doc.ref.path}:`, error);
    await updateDocWithError(doc, error);
  } finally {
    processingDocs.delete(docKey);
  }
}

export function startClipGifProcessing(guildId: string) {
  const collectionPath = getClipCollectionPath(guildId);
  const listenerKey = `${guildId}:${collectionPath}`;
  if (activeListeners.has(listenerKey)) {
    return;
  }

  const db = getAdminDb();
  const collectionRef = db.collection(collectionPath);

  const unsubscribe = collectionRef.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "removed") {
        return;
      }

      void processClipDoc(guildId, change.doc);
    });
  });

  activeListeners.set(listenerKey, unsubscribe);
}

export function stopClipGifProcessing(guildId: string) {
  const collectionPath = getClipCollectionPath(guildId);
  const listenerKey = `${guildId}:${collectionPath}`;
  const unsubscribe = activeListeners.get(listenerKey);
  if (unsubscribe) {
    unsubscribe();
    activeListeners.delete(listenerKey);
  }
}
