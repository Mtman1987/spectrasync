
import {z} from 'genkit';

// Schema for generate-user-content.ts
export const GenerateUserContentInputSchema = z.object({
  userDraft: z
    .string()
    .describe('The initial draft of the content written by the user.'),
});
export type GenerateUserContentInput = z.infer<
  typeof GenerateUserContentInputSchema
>;

export const GenerateUserContentOutputSchema = z.object({
  showcasePost: z
    .string()
    .describe(
      'A polished and well-written version of the user\'s draft, suitable for a community showcase.'
    ),
});
export type GenerateUserContentOutput = z.infer<
  typeof GenerateUserContentOutputSchema
>;
