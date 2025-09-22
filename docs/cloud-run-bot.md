# Deploying the Discord bot to Cloud Run

The web UI already deploys through Firebase Hosting. To run the Discord bot as a separate Cloud Run service, build the container image from this repository with the `Dockerfile.bot` definition.

## Prerequisites

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) configured with your project and region
- A Google Artifact Registry (or Container Registry) repository to host images
- Discord, Twitch, Firebase, and GIF conversion environment variables ready

## Build and push

```bash
# set these once per shell
export REGION=us-central1
export PROJECT_ID="your-project-id"
export REPO="discord-bot"
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/cosmic-raid-bot"

# Build and push the image using Cloud Build
gcloud builds submit --tag "$IMAGE" --file Dockerfile.bot
```

## Deploy

```bash
gcloud run deploy cosmic-raid-bot \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars DISCORD_BOT_TOKEN=xxx,NEXT_PUBLIC_DISCORD_CLIENT_ID=xxx \
  --set-env-vars FIREBASE_PROJECT_ID=xxx,FIREBASE_CLIENT_EMAIL=xxx,FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n..." \
  --set-env-vars TWITCH_CLIENT_ID=xxx,TWITCH_CLIENT_SECRET=xxx \
  --set-env-vars GIF_WIDTH=480,GIF_FPS=15,GIF_LOOP=0
```

Provide every environment variable the bot needs (Discord credentials, Firebase Admin keys, Twitch client settings, and any feature toggles). Cloud Run automatically injects the `PORT` variable used by the health server so the service passes readiness checks while the bot runs.

## Notes

- The container installs all Node dependencies and starts the bot with `npm run bot`.
- The health server responds to `/healthz` and `/readyz`, which satisfies Cloud Run’s default probes.
- Update the environment variable list to match any additional settings you use in production.
