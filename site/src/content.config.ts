import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { z } from "astro/zod";

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        // The landing hero's three lines under its tagline (Hero.astro).
        heroPoints: z.array(z.object({ title: z.string(), text: z.string() })).optional(),
      }),
    }),
  }),
};
