-- Rename the "Menus" feature to "Meal Plans", and rename the older
-- single-recipe calendar "MealPlan" feature to "ScheduledMeal" to free the name.
--
-- Data-preserving: uses ALTER ... RENAME (no DROP/CREATE), so existing rows survive.
-- Order matters: free up "meal_plans" (calendar) BEFORE the menus tables claim it.
--
-- Apply with:
--   npx prisma db execute --file prisma/sql/rename-menus-to-meal-plans.sql
--
-- The constraint/index renames at the bottom keep names aligned with Prisma's
-- conventions so `prisma db push` reports the schema as already in sync. They
-- assume PostgreSQL-default constraint names (as produced by the initial push).

-- ===========================================================================
-- Tables & columns
-- ===========================================================================

-- Phase A: calendar MealPlan -> ScheduledMeal  (frees the "meal_plans" name)
ALTER TABLE "meal_plans" RENAME TO "scheduled_meals";

-- Phase B: Menus -> Meal Plans
ALTER TABLE "menus"        RENAME TO "meal_plans";
ALTER TABLE "menu_items"   RENAME TO "meal_plan_items";
ALTER TABLE "menu_usages"  RENAME TO "meal_plan_usages";

ALTER TABLE "meal_plan_items"  RENAME COLUMN "menu_id" TO "meal_plan_id";
ALTER TABLE "meal_plan_usages" RENAME COLUMN "menu_id" TO "meal_plan_id";

-- ===========================================================================
-- Constraint & index names (align with Prisma conventions)
-- Done in this order so the swapped meal_plans/scheduled_meals names don't collide.
-- ===========================================================================

-- scheduled_meals (was meal_plans)
ALTER TABLE "scheduled_meals" RENAME CONSTRAINT "meal_plans_id_not_null"           TO "scheduled_meals_id_not_null";
ALTER TABLE "scheduled_meals" RENAME CONSTRAINT "meal_plans_user_id_not_null"      TO "scheduled_meals_user_id_not_null";
ALTER TABLE "scheduled_meals" RENAME CONSTRAINT "meal_plans_recipe_id_not_null"    TO "scheduled_meals_recipe_id_not_null";
ALTER TABLE "scheduled_meals" RENAME CONSTRAINT "meal_plans_planned_date_not_null" TO "scheduled_meals_planned_date_not_null";
ALTER TABLE "scheduled_meals" RENAME CONSTRAINT "meal_plans_sort_order_not_null"   TO "scheduled_meals_sort_order_not_null";
ALTER TABLE "scheduled_meals" RENAME CONSTRAINT "meal_plans_created_at_not_null"   TO "scheduled_meals_created_at_not_null";
ALTER TABLE "scheduled_meals" RENAME CONSTRAINT "meal_plans_updated_at_not_null"   TO "scheduled_meals_updated_at_not_null";
ALTER TABLE "scheduled_meals" RENAME CONSTRAINT "meal_plans_pkey"                  TO "scheduled_meals_pkey";
ALTER TABLE "scheduled_meals" RENAME CONSTRAINT "meal_plans_user_id_fkey"          TO "scheduled_meals_user_id_fkey";
ALTER TABLE "scheduled_meals" RENAME CONSTRAINT "meal_plans_recipe_id_fkey"        TO "scheduled_meals_recipe_id_fkey";
ALTER INDEX "meal_plans_user_id_planned_date_idx" RENAME TO "scheduled_meals_user_id_planned_date_idx";
ALTER INDEX "meal_plans_recipe_id_idx"            RENAME TO "scheduled_meals_recipe_id_idx";

-- meal_plans (was menus)
ALTER TABLE "meal_plans" RENAME CONSTRAINT "menus_id_not_null"         TO "meal_plans_id_not_null";
ALTER TABLE "meal_plans" RENAME CONSTRAINT "menus_user_id_not_null"    TO "meal_plans_user_id_not_null";
ALTER TABLE "meal_plans" RENAME CONSTRAINT "menus_title_not_null"      TO "meal_plans_title_not_null";
ALTER TABLE "meal_plans" RENAME CONSTRAINT "menus_created_at_not_null" TO "meal_plans_created_at_not_null";
ALTER TABLE "meal_plans" RENAME CONSTRAINT "menus_updated_at_not_null" TO "meal_plans_updated_at_not_null";
ALTER TABLE "meal_plans" RENAME CONSTRAINT "menus_pkey"                TO "meal_plans_pkey";
ALTER TABLE "meal_plans" RENAME CONSTRAINT "menus_user_id_fkey"        TO "meal_plans_user_id_fkey";
ALTER INDEX "menus_user_id_idx" RENAME TO "meal_plans_user_id_idx";

-- meal_plan_items (was menu_items)
ALTER TABLE "meal_plan_items" RENAME CONSTRAINT "menu_items_id_not_null"         TO "meal_plan_items_id_not_null";
ALTER TABLE "meal_plan_items" RENAME CONSTRAINT "menu_items_menu_id_not_null"    TO "meal_plan_items_meal_plan_id_not_null";
ALTER TABLE "meal_plan_items" RENAME CONSTRAINT "menu_items_recipe_id_not_null"  TO "meal_plan_items_recipe_id_not_null";
ALTER TABLE "meal_plan_items" RENAME CONSTRAINT "menu_items_servings_not_null"   TO "meal_plan_items_servings_not_null";
ALTER TABLE "meal_plan_items" RENAME CONSTRAINT "menu_items_sort_order_not_null" TO "meal_plan_items_sort_order_not_null";
ALTER TABLE "meal_plan_items" RENAME CONSTRAINT "menu_items_created_at_not_null" TO "meal_plan_items_created_at_not_null";
ALTER TABLE "meal_plan_items" RENAME CONSTRAINT "menu_items_updated_at_not_null" TO "meal_plan_items_updated_at_not_null";
ALTER TABLE "meal_plan_items" RENAME CONSTRAINT "menu_items_menu_id_fkey"        TO "meal_plan_items_meal_plan_id_fkey";
ALTER TABLE "meal_plan_items" RENAME CONSTRAINT "menu_items_recipe_id_fkey"      TO "meal_plan_items_recipe_id_fkey";
ALTER INDEX "menu_items_menu_id_idx"   RENAME TO "meal_plan_items_meal_plan_id_idx";
ALTER INDEX "menu_items_recipe_id_idx" RENAME TO "meal_plan_items_recipe_id_idx";

-- meal_plan_usages (was menu_usages)
ALTER TABLE "meal_plan_usages" RENAME CONSTRAINT "menu_usages_id_not_null"         TO "meal_plan_usages_id_not_null";
ALTER TABLE "meal_plan_usages" RENAME CONSTRAINT "menu_usages_menu_id_not_null"    TO "meal_plan_usages_meal_plan_id_not_null";
ALTER TABLE "meal_plan_usages" RENAME CONSTRAINT "menu_usages_user_id_not_null"    TO "meal_plan_usages_user_id_not_null";
ALTER TABLE "meal_plan_usages" RENAME CONSTRAINT "menu_usages_start_date_not_null" TO "meal_plan_usages_start_date_not_null";
ALTER TABLE "meal_plan_usages" RENAME CONSTRAINT "menu_usages_type_not_null"       TO "meal_plan_usages_type_not_null";
ALTER TABLE "meal_plan_usages" RENAME CONSTRAINT "menu_usages_created_at_not_null" TO "meal_plan_usages_created_at_not_null";
ALTER TABLE "meal_plan_usages" RENAME CONSTRAINT "menu_usages_updated_at_not_null" TO "meal_plan_usages_updated_at_not_null";
ALTER TABLE "meal_plan_usages" RENAME CONSTRAINT "menu_usages_menu_id_fkey"        TO "meal_plan_usages_meal_plan_id_fkey";
ALTER TABLE "meal_plan_usages" RENAME CONSTRAINT "menu_usages_user_id_fkey"        TO "meal_plan_usages_user_id_fkey";
ALTER INDEX "menu_usages_menu_id_idx" RENAME TO "meal_plan_usages_meal_plan_id_idx";
ALTER INDEX "menu_usages_user_id_idx" RENAME TO "meal_plan_usages_user_id_idx";
