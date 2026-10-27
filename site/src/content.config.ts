import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { z } from "astro/zod";

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        // The landing hero's doors under its tagline, one for each kind of
        // visitor (Hero.astro): what Wake gives them, in three lines, and
        // where they go next. Hero.astro keeps each door's install line.
        heroDoors: z
          .array(
            z.object({
              id: z.string(),
              label: z.string(),
              lead: z.string(),
              points: z.array(z.object({ title: z.string(), text: z.string() })),
              actions: z.array(
                z.object({
                  text: z.string(),
                  link: z.string(),
                  variant: z.enum(["primary", "secondary"]),
                }),
              ),
            }),
          )
          .optional(),
      }),
    }),
  }),
};
