/**
 * THE BLOG IS A CONTENT COLLECTION: Markdown files in src/content/blog, no MDX.
 *
 * Every field the pages print is declared here, so a post cannot be published without a title, a date and a
 * summary. `draft` keeps a post out of the build until it is ready. The one post today is
 * src/content/blog/what-works-today.md, and each claim in it was checked against the code on the branch.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
