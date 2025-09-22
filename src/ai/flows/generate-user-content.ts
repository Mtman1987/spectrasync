
'use server';
/**
 * @fileOverview A flow for helping users generate a polished showcase post from their draft.
 *
 * - generateUserContent - A function that takes a user's draft and returns a refined version.
 * - GenerateUserContentInput - The input type for the generateUserContent function.
 * - GenerateUserContentOutput - The return type for the generateUserContent function.
 */

import {ai} from '@/ai/genkit';
import { GenerateUserContentInputSchema, GenerateUserContentOutputSchema, type GenerateUserContentInput, type GenerateUserContentOutput } from './schemas';


export async function generateUserContent(
  input: GenerateUserContentInput
): Promise<GenerateUserContentOutput> {
  return generateUserContentFlow(input);
}

const generateContentPrompt = ai.definePrompt({
  name: 'generateUserContentPrompt',
  input: {schema: GenerateUserContentInputSchema},
  output: {schema: GenerateUserContentOutputSchema},
  prompt: `You are a helpful and friendly community assistant. A user wants to create a post for a community showcase.
  Your task is to take their draft and polish it into a clear, positive, and engaging message.

  - Keep the core message and key details from the user's draft.
  - Improve grammar, spelling, and sentence structure.
  - Enhance the tone to be more positive and engaging, using enthusiastic language and emojis where appropriate.
  - Do not add any information that the user did not provide.
  - The final output should be ready to be posted directly.

  User's Draft:
  "{{{userDraft}}}"
  `,
  config: {
    // Stricter safety settings for user-generated content
    safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ]
  }
});

const generateUserContentFlow = ai.defineFlow(
  {
    name: 'generateUserContentFlow',
    inputSchema: GenerateUserContentInputSchema,
    outputSchema: GenerateUserContentOutputSchema,
  },
  async input => {
    const {output} = await generateContentPrompt(input);
    return output!;
  }
);
