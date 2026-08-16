import path from "node:path";
import { z } from "zod";
import { UploadRoleSchema } from "../preset/schema.js";

export const CharacterNameSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);

const RelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      if (path.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
      const parts = value.replace(/\\/g, "/").split("/");
      return !parts.includes("") && !parts.includes(".") && !parts.includes("..");
    },
    { message: "path must be a safe relative path" },
  )
  .transform((value) => value.replace(/\\/g, "/"));

const pathUnder = (directory: "refs" | "gallery") =>
  RelativePathSchema.refine((value) => value.startsWith(`${directory}/`), {
    message: `path must be under ${directory}/`,
  });

export const CharacterFormSchema = z.object({
  id: CharacterNameSchema,
  appearance: z.string().optional(),
  refs: z.array(pathUnder("refs")).default([]),
});

export const CharacterReferenceSchema = z.object({
  file: pathUnder("refs"),
  role: UploadRoleSchema.default("reference_image"),
  forms: z.array(CharacterNameSchema).optional(),
  note: z.string().optional(),
});

export const CharacterLoraSchema = z.object({
  file: RelativePathSchema,
  strength: z.number().finite().default(1),
  base: z.string().min(1).optional(),
});

export const CharacterKitSchema = z.object({
  prompt_prefix: z.string().optional(),
  negative: z.string().optional(),
  prompt_template: z.string().optional(),
  note: z.string().optional(),
});

export const CharacterSchema = z
  .object({
    version: z.literal(1),
    name: CharacterNameSchema,
    display_name: z.string().min(1).optional(),
    appearance: z.string().default(""),
    triggers: z
      .record(z.string())
      .default({ default: "" })
      .transform((triggers) => ({ default: "", ...triggers })),
    style: z.string().default(""),
    negative: z.string().default(""),
    prompt_template: z.string().default("{trigger} {appearance}, {prompt}, {style}"),
    forms: z.array(CharacterFormSchema).default([{ id: "default", refs: [] }]),
    references: z.array(CharacterReferenceSchema).default([]),
    loras: z.array(CharacterLoraSchema).default([]),
    content_rating: z
      .object({
        age_depicted: z.enum(["child", "teen", "adult", "unspecified"]).default("unspecified"),
        allow_nsfw: z.boolean().default(false),
      })
      .default({ age_depicted: "unspecified", allow_nsfw: false }),
    kits: z.record(CharacterKitSchema).default({}),
    privacy: z
      .object({
        export_refs: z.boolean().default(false),
        export_gallery: z.boolean().default(false),
      })
      .default({ export_refs: false, export_gallery: false }),
    tags: z.array(z.string().min(1)).default([]),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .superRefine((character, ctx) => {
    if (!character.forms.some(({ id }) => id === "default")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forms"],
        message: "forms must include default",
      });
    }
    const formIds = new Set(character.forms.map(({ id }) => id));
    if (formIds.size !== character.forms.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forms"],
        message: "form IDs must be unique",
      });
    }
    for (const [index, reference] of character.references.entries()) {
      for (const form of reference.forms ?? []) {
        if (!formIds.has(form)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["references", index, "forms"],
            message: `unknown form: ${form}`,
          });
        }
      }
    }
  });

export const GalleryItemSchema = z.object({
  id: z.string().min(1),
  job_id: z.string().min(1),
  output_index: z.number().int().min(0),
  file: pathUnder("gallery"),
  caption: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]),
  form: CharacterNameSchema.optional(),
  approved: z.enum(["pending", "human"]).default("pending"),
  added_at: z.string().datetime(),
  approved_at: z.string().datetime().optional(),
});

export const CharacterGallerySchema = z.object({
  version: z.literal(1),
  items: z.array(GalleryItemSchema).default([]),
});

export const CharacterIndexEntrySchema = z.object({
  job_id: z.string().min(1),
  at: z.string().datetime(),
  project: z.string().min(1),
  preset: z.string().min(1),
  output_dir: z.string().min(1),
  kind: z.string().min(1),
  prompt_final: z.string().optional(),
  favorite: z.boolean().optional(),
});

export type Character = z.infer<typeof CharacterSchema>;
export type CharacterForm = z.infer<typeof CharacterFormSchema>;
export type CharacterReference = z.infer<typeof CharacterReferenceSchema>;
export type CharacterLora = z.infer<typeof CharacterLoraSchema>;
export type CharacterKit = z.infer<typeof CharacterKitSchema>;
export type CharacterGallery = z.infer<typeof CharacterGallerySchema>;
export type GalleryItem = z.infer<typeof GalleryItemSchema>;
export type CharacterIndexEntry = z.infer<typeof CharacterIndexEntrySchema>;
