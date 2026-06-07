import { z } from "zod";

export const ingredientSchema = z.object({
  name: z.string().min(1, "Ingredient name is required").max(200),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  preparation: z.string().max(200).nullable().optional(),
  isOptional: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

export const ingredientGroupSchema = z.object({
  name: z.string().max(200).default(""),
  sortOrder: z.number().int().min(0).default(0),
  ingredients: z.array(ingredientSchema).default([]),
});

export const stepSchema = z.object({
  body: z.string().min(1, "Step text is required"),
  sortOrder: z.number().int().min(0).default(0),
  sectionHeader: z.string().max(200).nullable().optional(),
});

export const recipeCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  servings: z.number().int().min(1).default(4),
  prepTimeMinutes: z.number().int().min(0).nullable().optional(),
  cookTimeMinutes: z.number().int().min(0).nullable().optional(),
  complexity: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  dishType: z.string().max(100).nullable().optional(),
  cuisine: z.string().max(100).nullable().optional(),
  flavorProfile: z.string().max(500).nullable().optional(),
  ingredientGroups: z.array(ingredientGroupSchema).default([]),
  steps: z.array(stepSchema).default([]),
});
