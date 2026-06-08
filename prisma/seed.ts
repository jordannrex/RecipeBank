/**
 * RecipeBank demo seed
 *
 * Creates a fully-populated demo account covering every feature:
 *   • 5 recipes (2 favorites, varied complexity/cuisine/dish type)
 *   • 1 menu with all 5 items, 1 past logged usage, 1 upcoming planned usage
 *   • 2 cook logs (with notes)
 *   • 1 upcoming meal plan
 *   • 3 recipe notes
 *   • 2 shopping lists (across 2 recipes, mix of checked/unchecked items)
 *
 * Every record uses a stable "seed-*" id so the seed is fully idempotent —
 * running it multiple times is safe.
 *
 * Run with: npm run db:seed
 */

import { PrismaClient, Complexity } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Client (Prisma v7 requires an explicit driver adapter)
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Stable IDs — never change these so the seed stays idempotent
// ---------------------------------------------------------------------------

const ID = {
  // ── User ──────────────────────────────────────────────────────────────────
  user: "seed-user-demo",

  // ── Recipes ───────────────────────────────────────────────────────────────
  recipe: {
    pasta:   "seed-recipe-pasta",
    chicken: "seed-recipe-chicken",
    burgers: "seed-recipe-burgers",
    heroes:  "seed-recipe-heroes",
    shrimp:  "seed-recipe-shrimp",
  },

  // ── Ingredient groups ─────────────────────────────────────────────────────
  grp: {
    pastaNoodle: "seed-grp-pasta-noodle",
    pastaSauce:  "seed-grp-pasta-sauce",

    chickenMain: "seed-grp-chicken-main",

    burgersWedges:  "seed-grp-burgers-wedges",
    burgersPatties: "seed-grp-burgers-patties",
    burgersJam:     "seed-grp-burgers-jam",
    burgersSauce:   "seed-grp-burgers-sauce",

    heroesMain: "seed-grp-heroes-main",

    shrimpStirFry: "seed-grp-shrimp-stirfry",
    shrimpRice:    "seed-grp-shrimp-rice",
  },

  // ── Ingredients ───────────────────────────────────────────────────────────
  ing: {
    // Pasta
    pastaFettuccine:  "seed-ing-pasta-fettuccine",
    pastaCookSalt:    "seed-ing-pasta-cooksalt",
    pastaCream:       "seed-ing-pasta-cream",
    pastaGarlic:      "seed-ing-pasta-garlic",
    pastaButter:      "seed-ing-pasta-butter",
    pastaParmesan:    "seed-ing-pasta-parmesan",
    pastaFinishSalt:  "seed-ing-pasta-finishsalt",

    // Chicken
    chickenThighs:    "seed-ing-chicken-thighs",
    chickenPaprika:   "seed-ing-chicken-paprika",
    chickenOil:       "seed-ing-chicken-oil",
    chickenGarlic:    "seed-ing-chicken-garlic",
    chickenOnionPwd:  "seed-ing-chicken-onionpwd",
    chickenOldBay:    "seed-ing-chicken-oldbay",

    // Burgers – potato wedges
    burgersWedgePotatoes: "seed-ing-burgers-wpdpotatoes",
    burgersWedgeSalt:     "seed-ing-burgers-wpdgsalt",
    burgersWedgePepper:   "seed-ing-burgers-wpdgpepper",
    burgersWedgeOil:      "seed-ing-burgers-wpdgoil",
    // Burgers – patties
    burgersBeef:          "seed-ing-burgers-beef",
    burgersGouda:         "seed-ing-burgers-gouda",
    burgersBuns:          "seed-ing-burgers-buns",
    // Burgers – tomato onion jam
    burgersStock:         "seed-ing-burgers-stock",
    burgersOnion:         "seed-ing-burgers-onion",
    burgersTomato:        "seed-ing-burgers-tomato",
    // Burgers – sauce
    burgersMayo:          "seed-ing-burgers-mayo",
    burgersSmkPaprika:    "seed-ing-burgers-smkpaprika",
    burgersSourCream:     "seed-ing-burgers-sourcream",

    // Heroes
    heroesPotatoes:    "seed-ing-heroes-potatoes",
    heroesPeppers:     "seed-ing-heroes-peppers",
    heroesOnion:       "seed-ing-heroes-onion",
    heroesGarlicPwd:   "seed-ing-heroes-garlicpwd",
    heroesSausage:     "seed-ing-heroes-sausage",
    heroesTomatoPaste: "seed-ing-heroes-tomatopaste",
    heroesItalianSeas: "seed-ing-heroes-italianseas",
    heroesBaguettes:   "seed-ing-heroes-baguettes",
    heroesMozzarella:  "seed-ing-heroes-mozzarella",

    // Shrimp stir-fry
    shrimpShrimp:      "seed-ing-shrimp-shrimp",
    shrimpHoney:       "seed-ing-shrimp-honey",
    shrimpSoy:         "seed-ing-shrimp-soy",
    shrimpGarlic:      "seed-ing-shrimp-garlic",
    shrimpGinger:      "seed-ing-shrimp-ginger",
    shrimpSesameOil:   "seed-ing-shrimp-sesameOil",
    shrimpCornstarch:  "seed-ing-shrimp-cornstarch",
    shrimpBroccoli:    "seed-ing-shrimp-broccoli",
    shrimpBellPepper:  "seed-ing-shrimp-bellpepper",
    shrimpRice:        "seed-ing-shrimp-rice",
    shrimpGreenOnion:  "seed-ing-shrimp-greenonion",
  },

  // ── Menu ──────────────────────────────────────────────────────────────────
  menu:       "seed-menu-weeknight",
  menuItem: {
    burgers: "seed-menuitem-burgers",
    pasta:   "seed-menuitem-pasta",
    chicken: "seed-menuitem-chicken",
    heroes:  "seed-menuitem-heroes",
    shrimp:  "seed-menuitem-shrimp",
  },
  menuUsagePast:    "seed-menuusage-past",
  menuUsagePlanned: "seed-menuusage-planned",

  // ── Cook logs ─────────────────────────────────────────────────────────────
  cookLog: {
    burgers: "seed-cooklog-burgers",
    heroes:  "seed-cooklog-heroes",
  },

  // ── Meal plan ─────────────────────────────────────────────────────────────
  mealPlan: {
    shrimp: "seed-mealplan-shrimp",
  },

  // ── Recipe notes ──────────────────────────────────────────────────────────
  note: {
    burgers: "seed-note-burgers",
    heroes:  "seed-note-heroes",
    chicken: "seed-note-chicken",
  },

  // ── Shopping lists & items ─────────────────────────────────────────────────
  shopList: {
    pasta:  "seed-shoplist-pasta",
    heroes: "seed-shoplist-heroes",
  },
  shopItem: {
    fettuccine: "seed-shopitem-fettuccine",
    cream:      "seed-shopitem-cream",
    garlic:     "seed-shopitem-garlic",
    potatoes:   "seed-shopitem-potatoes",
    peppers:    "seed-shopitem-peppers",
  },
} as const;

// ---------------------------------------------------------------------------
// Date helpers — all @db.Date fields need UTC-midnight Dates
// ---------------------------------------------------------------------------

/** Returns a UTC-midnight Date offset by `days` from today. */
function d(days = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // ── 1. User ─────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("demo1234!", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@recipebank.app" },
    update: {},
    create: {
      id: ID.user,
      email: "demo@recipebank.app",
      username: "demo_user",
      displayName: "Demo Chef",
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
    select: { id: true, email: true },
  });

  console.log(`✓ User: ${user.email} (id: ${user.id})`);

  // ── 2. Recipes ──────────────────────────────────────────────────────────────
  //
  // We upsert the recipe header and then upsert each ingredient group,
  // ingredient, and step separately so the seed is idempotent even when
  // ingredient IDs are stable and referenced by the shopping list below.

  // ── 2a. Creamy Garlic Pasta ─────────────────────────────────────────────────
  await prisma.recipe.upsert({
    where:  { id: ID.recipe.pasta },
    update: {},
    create: {
      id: ID.recipe.pasta, userId: user.id,
      title: "Creamy Garlic Pasta",
      description: "A cozy weeknight pasta with a silky garlic cream sauce.",
      servings: 2, currentServings: 2,
      prepTimeMinutes: 10, cookTimeMinutes: 15,
      complexity: Complexity.EASY,
      dishType: "Pasta", cuisine: "Italian",
      flavorProfile: "creamy, garlicky, comforting",
      isFavorite: false,
    },
  });

  await upsertGroup(ID.grp.pastaNoodle, ID.recipe.pasta, "Pasta", 0);
  await upsertIng(ID.ing.pastaFettuccine, ID.grp.pastaNoodle, "fettuccine",    6,    "oz",      null,     false, 0);
  await upsertIng(ID.ing.pastaCookSalt,   ID.grp.pastaNoodle, "salt",           null, "to taste", null,    false, 1);

  await upsertGroup(ID.grp.pastaSauce, ID.recipe.pasta, "Sauce", 1);
  await upsertIng(ID.ing.pastaCream,     ID.grp.pastaSauce, "heavy cream", 1,    "cup",    null,      false, 0);
  await upsertIng(ID.ing.pastaGarlic,    ID.grp.pastaSauce, "garlic",      4,    "cloves", "minced",  false, 1);
  await upsertIng(ID.ing.pastaButter,    ID.grp.pastaSauce, "butter",      1,    "tbsp",   null,      false, 2);
  await upsertIng(ID.ing.pastaParmesan,  ID.grp.pastaSauce, "parmesan",    0.5,  "cup",    "grated",  false, 3);
  await upsertIng(ID.ing.pastaFinishSalt,ID.grp.pastaSauce, "salt",        null, "to taste", null,    false, 4);

  await upsertSteps(ID.recipe.pasta, [
    { header: "Cook the pasta",  body: "Boil pasta in generously salted water until al dente. Reserve 1 cup pasta water before draining." },
    { header: "Make the sauce",  body: "Melt butter in a large skillet over medium heat. Add garlic and sauté 1 minute until fragrant. Pour in the cream and simmer for 3 minutes. Add parmesan and toss with the drained pasta, loosening with pasta water as needed. Season with salt." },
  ]);

  // ── 2b. Herb Roasted Chicken Thighs ─────────────────────────────────────────
  await prisma.recipe.upsert({
    where:  { id: ID.recipe.chicken },
    update: {},
    create: {
      id: ID.recipe.chicken, userId: user.id,
      title: "Herb Roasted Chicken Thighs",
      description: "Juicy, golden-skinned chicken thighs seasoned with paprika, garlic, and Old Bay. A reliable weeknight dinner with almost zero prep.",
      servings: 2, currentServings: 2,
      prepTimeMinutes: 10, cookTimeMinutes: 30,
      complexity: Complexity.EASY,
      dishType: "Main Course", cuisine: "American",
      flavorProfile: "savory, smoky, herby",
      isFavorite: false,
    },
  });

  await upsertGroup(ID.grp.chickenMain, ID.recipe.chicken, "", 0);
  await upsertIng(ID.ing.chickenThighs,   ID.grp.chickenMain, "Boneless Skinless Chicken Thighs", 1,   "lb",   null,       false, 0);
  await upsertIng(ID.ing.chickenPaprika,  ID.grp.chickenMain, "Paprika",                           0.5, "tbsp", null,       false, 1);
  await upsertIng(ID.ing.chickenOil,      ID.grp.chickenMain, "Olive Oil",                         0.5, "tbsp", null,       false, 2);
  await upsertIng(ID.ing.chickenGarlic,   ID.grp.chickenMain, "Garlic",                            2,   "clove","minced",   false, 3);
  await upsertIng(ID.ing.chickenOnionPwd, ID.grp.chickenMain, "Onion Powder",                      0.5, "tbsp", null,       false, 4);
  await upsertIng(ID.ing.chickenOldBay,   ID.grp.chickenMain, "Old Bay Seasoning",                 1,   "tsp",  null,       true,  5);

  await upsertSteps(ID.recipe.chicken, [
    { header: "Marinate",         body: "Combine olive oil, paprika, garlic, onion powder, and Old Bay in a bowl. Add chicken thighs and toss to coat. Marinate in the fridge for at least 30 minutes — or overnight for deeper flavour." },
    { header: "Roast",            body: "Preheat oven to 425 °F. Arrange chicken in a single layer on a baking sheet. Roast 25–30 minutes until cooked through and the skin is golden and slightly crispy." },
    { header: "Rest and serve",   body: "Let rest 5 minutes before serving." },
  ]);

  // ── 2c. Gouda Smash Burgers ──────────────────────────────────────────────────
  await prisma.recipe.upsert({
    where:  { id: ID.recipe.burgers },
    update: {},
    create: {
      id: ID.recipe.burgers, userId: user.id,
      title: "Gouda Vibes Burgers with Tomato Onion Jam & Potato Wedges",
      description:
        "Cheeseburgers are pretty much a perfect food. Beef patty, a slice of cheese, maybe a squeeze of ketchup — that's all you need for a good one. For a GREAT one, it's best to leave it to the pros who settle for nothing less. Here, beef patties get topped with nutty gouda, sandwiched between toasty buns with tomato onion jam and a smoky special sauce. Oh, and there's potato wedges on the side.",
      servings: 2, currentServings: 2,
      prepTimeMinutes: 20, cookTimeMinutes: 30,
      complexity: Complexity.MEDIUM,
      dishType: "Burger", cuisine: "American",
      flavorProfile: "smoky, cheesy, sweet-savory",
      isFavorite: true,
      cookCount: 1,
      lastCookedAt: d(-1),
    },
  });

  await upsertGroup(ID.grp.burgersWedges,  ID.recipe.burgers, "Potato Wedges",    0);
  await upsertIng(ID.ing.burgersWedgePotatoes, ID.grp.burgersWedges, "Potatoes",    12,   "ounce",  null,  false, 0);
  await upsertIng(ID.ing.burgersWedgeSalt,     ID.grp.burgersWedges, "Salt",        null, "teaspoon",null, false, 1);
  await upsertIng(ID.ing.burgersWedgePepper,   ID.grp.burgersWedges, "Black Pepper",null, "teaspoon",null, false, 2);
  await upsertIng(ID.ing.burgersWedgeOil,      ID.grp.burgersWedges, "Olive Oil",   null, "drizzle", null, false, 3);

  await upsertGroup(ID.grp.burgersPatties, ID.recipe.burgers, "Burgers",          1);
  await upsertIng(ID.ing.burgersBeef,  ID.grp.burgersPatties, "Ground Beef",   10, "ounce", null, false, 0);
  await upsertIng(ID.ing.burgersGouda, ID.grp.burgersPatties, "Gouda Cheese",  2,  "slice", null, false, 1);
  await upsertIng(ID.ing.burgersBuns,  ID.grp.burgersPatties, "Potato Buns",   2,  null,    null, false, 2);

  await upsertGroup(ID.grp.burgersJam,     ID.recipe.burgers, "Tomato Onion Jam", 2);
  await upsertIng(ID.ing.burgersStock,  ID.grp.burgersJam, "Chicken Stock Concentrate", 1, null, null, false, 0);
  await upsertIng(ID.ing.burgersOnion,  ID.grp.burgersJam, "Yellow Onion",              1, null, null, false, 1);
  await upsertIng(ID.ing.burgersTomato, ID.grp.burgersJam, "Tomato",                    1, null, null, false, 2);

  await upsertGroup(ID.grp.burgersSauce,   ID.recipe.burgers, "Sauce",            3);
  await upsertIng(ID.ing.burgersMayo,       ID.grp.burgersSauce, "Mayonnaise",      2, "tablespoon", null, false, 0);
  await upsertIng(ID.ing.burgersSmkPaprika, ID.grp.burgersSauce, "Smoked Paprika",  1, "teaspoon",   null, false, 1);
  await upsertIng(ID.ing.burgersSourCream,  ID.grp.burgersSauce, "Sour Cream",      2, "tablespoon", null, false, 2);

  await upsertSteps(ID.recipe.burgers, [
    { header: null, body: "Adjust rack to top position and preheat oven to 425 °F. Wash and dry all produce. Cut potatoes into ½-inch-thick wedges. Dice tomato. Halve, peel, and thinly slice onion. Combine mayonnaise, sour cream, and a pinch of smoked paprika in a small bowl. Season with salt and pepper; set aside." },
    { header: null, body: "Toss potatoes on a baking sheet with a drizzle of oil; season with salt and pepper. Roast on top rack until browned and crispy, 20–25 minutes." },
    { header: null, body: "Meanwhile, heat a drizzle of oil in a large pan over medium-high heat. Add onion and cook until lightly browned, 8–10 minutes. Add tomato, stock concentrate, remaining smoked paprika, 1 tsp sugar, and 2 tbsp water. Cook, stirring, until caramelized and jammy, 2–3 minutes. Season with salt and pepper. Transfer to a small bowl." },
    { header: null, body: "Form beef into two patties, each slightly wider than a burger bun. Season generously with salt and pepper." },
    { header: null, body: "Heat a drizzle of oil in the same pan over medium-high heat. Add patties and cook 3–5 minutes per side to desired doneness. Top each patty with gouda in the last 1–2 minutes; cover pan to melt. Halve and toast buns until golden." },
    { header: null, body: "Spread bottom buns with a little sauce. Stack on the patties and tomato onion jam. Serve burgers alongside potato wedges with remaining sauce for dipping." },
  ]);

  // ── 2d. Pork Sausage & Pepper Heroes ────────────────────────────────────────
  await prisma.recipe.upsert({
    where:  { id: ID.recipe.heroes },
    update: {},
    create: {
      id: ID.recipe.heroes, userId: user.id,
      title: "Pork Sausage & Pepper Heroes",
      description:
        "These American heroes feature savory Italian pork sausage, sautéed peppers and onions, and a touch of tomato paste, all tucked into a baguette with melted mozzarella. Served hot, it's a hearty and flavorful sandwich perfect for a casual weeknight dinner or game day.",
      servings: 2, currentServings: 2,
      prepTimeMinutes: 20, cookTimeMinutes: 30,
      complexity: Complexity.MEDIUM,
      dishType: "Sandwich", cuisine: "American",
      flavorProfile: "savory, herby, cheesy",
      isFavorite: true,
      cookCount: 1,
      lastCookedAt: d(-21),
    },
  });

  await upsertGroup(ID.grp.heroesMain, ID.recipe.heroes, "", 0);
  await upsertIng(ID.ing.heroesPotatoes,    ID.grp.heroesMain, "Potatoes",                12,  "oz",  null, false, 0);
  await upsertIng(ID.ing.heroesPeppers,     ID.grp.heroesMain, "Long green peppers",       2,   null,  null, false, 1);
  await upsertIng(ID.ing.heroesOnion,       ID.grp.heroesMain, "Yellow Onion",             0.5, null,  null, false, 2);
  await upsertIng(ID.ing.heroesGarlicPwd,   ID.grp.heroesMain, "Garlic Powder",            1,   "tsp", null, false, 3);
  await upsertIng(ID.ing.heroesSausage,     ID.grp.heroesMain, "Italian Pork Sausage",     9,   "oz",  null, false, 4);
  await upsertIng(ID.ing.heroesTomatoPaste, ID.grp.heroesMain, "tomato paste",             1.5, "tbsp",null, false, 5);
  await upsertIng(ID.ing.heroesItalianSeas, ID.grp.heroesMain, "Italian Seasoning",        1,   "tbsp",null, false, 6);
  await upsertIng(ID.ing.heroesBaguettes,   ID.grp.heroesMain, "Demi Baguettes/Sub Rolls", 2,   null,  null, false, 7);
  await upsertIng(ID.ing.heroesMozzarella,  ID.grp.heroesMain, "Mozzarella Cheese",        1,   "cup", null, false, 8);

  await upsertSteps(ID.recipe.heroes, [
    { header: null, body: "Preheat oven to 425 °F." },
    { header: "Prep", body: "Cut potatoes into ½-inch wedges. Thinly slice onion and green peppers. Soften butter, then mix in garlic powder and a pinch of salt to make garlic butter." },
    { header: null, body: "Place potato wedges on a baking sheet. Drizzle with olive oil and season with salt and pepper. Roast 20–25 minutes until golden and crispy." },
    { header: null, body: "Sauté peppers and onions 5 minutes on medium heat until slightly softened. Remove from pan and set aside." },
    { header: null, body: "Add sausage to the pan. Season with Italian seasoning, salt, and pepper. Sear on medium-high heat, breaking into bite-sized pieces, until browned." },
    { header: null, body: "Add tomato paste and ¼ cup water. Stir to combine and cook until sausage is cooked through. Return peppers and onions to the pan and toss." },
    { header: null, body: "Spread garlic butter on the cut sides of the rolls. Load up with sausage, peppers, and ½ cup mozzarella per sandwich." },
    { header: null, body: "When wedges have 5 minutes left, add the assembled heroes to the oven and toast until buns are golden and cheese is melted." },
    { header: null, body: "Remove everything from the oven and serve immediately." },
  ]);

  // ── 2e. Honey Garlic Shrimp Stir-Fry (new!) ─────────────────────────────────
  await prisma.recipe.upsert({
    where:  { id: ID.recipe.shrimp },
    update: {},
    create: {
      id: ID.recipe.shrimp, userId: user.id,
      title: "Honey Garlic Shrimp Stir-Fry",
      description:
        "Plump shrimp tossed in a glossy honey-garlic sauce with crisp broccoli and bell pepper, served over steamed rice. Ready in under 25 minutes and better than takeout.",
      servings: 2, currentServings: 2,
      prepTimeMinutes: 10, cookTimeMinutes: 15,
      complexity: Complexity.EASY,
      dishType: "Stir-Fry", cuisine: "Asian",
      flavorProfile: "sweet, garlicky, umami",
      isFavorite: false,
    },
  });

  await upsertGroup(ID.grp.shrimpStirFry, ID.recipe.shrimp, "Stir-Fry", 0);
  await upsertIng(ID.ing.shrimpShrimp,     ID.grp.shrimpStirFry, "Large shrimp",      0.75, "lb",   "peeled and deveined", false, 0);
  await upsertIng(ID.ing.shrimpHoney,      ID.grp.shrimpStirFry, "Honey",             3,    "tbsp", null,                  false, 1);
  await upsertIng(ID.ing.shrimpSoy,        ID.grp.shrimpStirFry, "Soy sauce",         3,    "tbsp", null,                  false, 2);
  await upsertIng(ID.ing.shrimpGarlic,     ID.grp.shrimpStirFry, "Garlic",            4,    "cloves","minced",             false, 3);
  await upsertIng(ID.ing.shrimpGinger,     ID.grp.shrimpStirFry, "Fresh ginger",      1,    "tsp",  "grated",              false, 4);
  await upsertIng(ID.ing.shrimpSesameOil,  ID.grp.shrimpStirFry, "Sesame oil",        1,    "tsp",  null,                  false, 5);
  await upsertIng(ID.ing.shrimpCornstarch, ID.grp.shrimpStirFry, "Cornstarch",        1,    "tsp",  null,                  false, 6);
  await upsertIng(ID.ing.shrimpBroccoli,   ID.grp.shrimpStirFry, "Broccoli florets",  2,    "cups", null,                  false, 7);
  await upsertIng(ID.ing.shrimpBellPepper, ID.grp.shrimpStirFry, "Red bell pepper",   1,    null,   "sliced",              false, 8);
  await upsertIng(ID.ing.shrimpGreenOnion, ID.grp.shrimpStirFry, "Green onions",      2,    null,   "sliced, for garnish", true,  9);

  await upsertGroup(ID.grp.shrimpRice, ID.recipe.shrimp, "Rice", 1);
  await upsertIng(ID.ing.shrimpRice, ID.grp.shrimpRice, "Jasmine rice", 1, "cup", null, false, 0);

  await upsertSteps(ID.recipe.shrimp, [
    { header: "Make the sauce", body: "Whisk together honey, soy sauce, garlic, ginger, sesame oil, and cornstarch in a small bowl. Set aside." },
    { header: "Cook rice",      body: "Cook rice according to package directions." },
    { header: "Stir-fry",       body: "Heat a large skillet or wok over high heat with a drizzle of neutral oil. Add broccoli and bell pepper; stir-fry 3–4 minutes until tender-crisp. Push vegetables to the side, add shrimp, and cook 1–2 minutes per side until pink." },
    { header: "Finish",         body: "Pour the sauce over everything and toss to coat. Cook 1 minute more until the sauce thickens and glazes the shrimp. Serve over rice and garnish with green onions." },
  ]);

  console.log("✓ Recipes: Pasta, Chicken, Burgers, Heroes, Shrimp Stir-Fry");

  // ── 3. Menu ─────────────────────────────────────────────────────────────────
  await prisma.menu.upsert({
    where:  { id: ID.menu },
    update: {},
    create: {
      id: ID.menu, userId: user.id,
      title: "Summer Weeknight Menu",
      description: "A rotating set of quick dinners for the week — something comforting, something fresh, and a treat-yourself burger night.",
    },
  });

  // Menu items — one per recipe, spaced a day apart starting next week
  const menuItemDefs = [
    { id: ID.menuItem.burgers, recipeId: ID.recipe.burgers, servings: 2, cookDate: d(7),  sortOrder: 0, notes: null },
    { id: ID.menuItem.pasta,   recipeId: ID.recipe.pasta,   servings: 2, cookDate: d(8),  sortOrder: 1, notes: null },
    { id: ID.menuItem.chicken, recipeId: ID.recipe.chicken, servings: 2, cookDate: d(9),  sortOrder: 2, notes: null },
    { id: ID.menuItem.heroes,  recipeId: ID.recipe.heroes,  servings: 2, cookDate: d(10), sortOrder: 3, notes: null },
    { id: ID.menuItem.shrimp,  recipeId: ID.recipe.shrimp,  servings: 2, cookDate: d(11), sortOrder: 4, notes: "Double the sauce if you like it extra glossy." },
  ] as const;

  for (const item of menuItemDefs) {
    await prisma.menuItem.upsert({
      where:  { id: item.id },
      update: {},
      create: { ...item, menuId: ID.menu },
    });
  }

  // Menu usages — one logged in the past, one planned for this coming week
  await prisma.menuUsage.upsert({
    where:  { id: ID.menuUsagePast },
    update: {},
    create: {
      id: ID.menuUsagePast, menuId: ID.menu, userId: user.id,
      type: "logged",
      startDate: d(-28), endDate: d(-22),
      notes: "Everyone loved the burger night. Will repeat.",
    },
  });

  await prisma.menuUsage.upsert({
    where:  { id: ID.menuUsagePlanned },
    update: {},
    create: {
      id: ID.menuUsagePlanned, menuId: ID.menu, userId: user.id,
      type: "planned",
      startDate: d(7), endDate: d(13),
      notes: null,
    },
  });

  console.log("✓ Menu: Summer Weeknight Menu (5 items, 1 past log, 1 planned)");

  // ── 4. Cook logs ─────────────────────────────────────────────────────────────
  await prisma.cookLog.upsert({
    where:  { id: ID.cookLog.burgers },
    update: {},
    create: {
      id: ID.cookLog.burgers, userId: user.id, recipeId: ID.recipe.burgers,
      cookedAt: d(-1),
      notes: "Came out perfectly. Next time I'd toast the buns in the air fryer for a crispier finish.",
    },
  });

  await prisma.cookLog.upsert({
    where:  { id: ID.cookLog.heroes },
    update: {},
    create: {
      id: ID.cookLog.heroes, userId: user.id, recipeId: ID.recipe.heroes,
      cookedAt: d(-21),
      notes: null,
    },
  });

  console.log("✓ Cook logs: Burgers (yesterday), Heroes (3 weeks ago)");

  // ── 5. Meal plan ─────────────────────────────────────────────────────────────
  await prisma.mealPlan.upsert({
    where:  { id: ID.mealPlan.shrimp },
    update: {},
    create: {
      id: ID.mealPlan.shrimp, userId: user.id, recipeId: ID.recipe.shrimp,
      plannedDate: d(7),
      sortOrder: 0,
    },
  });

  console.log("✓ Meal plan: Shrimp Stir-Fry (next week)");

  // ── 6. Recipe notes ───────────────────────────────────────────────────────────
  await prisma.recipeNote.upsert({
    where:  { id: ID.note.burgers },
    update: {},
    create: {
      id: ID.note.burgers, userId: user.id, recipeId: ID.recipe.burgers,
      body: "Add a pinch of smoked paprika to the special sauce until it reaches a pink-orange color — makes a big visual difference.",
    },
  });

  await prisma.recipeNote.upsert({
    where:  { id: ID.note.heroes },
    update: {},
    create: {
      id: ID.note.heroes, userId: user.id, recipeId: ID.recipe.heroes,
      body: "1–1.5 Yukon gold potatoes are the perfect amount per serving. Don't skip the garlic butter on the roll.",
    },
  });

  await prisma.recipeNote.upsert({
    where:  { id: ID.note.chicken },
    update: {},
    create: {
      id: ID.note.chicken, userId: user.id, recipeId: ID.recipe.chicken,
      body: "Marinating overnight makes a huge difference in flavor depth.",
    },
  });

  console.log("✓ Recipe notes: Burgers, Heroes, Chicken");

  // ── 7. Shopping lists ─────────────────────────────────────────────────────────
  //
  // List A: Creamy Garlic Pasta — 3 items, all unchecked (still need to buy)
  // List B: Pork Sausage Heroes — 2 items; Potatoes already checked (have it),
  //         Long green peppers still unchecked (need to buy)

  // List A — Pasta
  await prisma.shoppingList.upsert({
    where:  { id: ID.shopList.pasta },
    update: {},
    create: {
      id: ID.shopList.pasta, userId: user.id, recipeId: ID.recipe.pasta,
      name: "Creamy Garlic Pasta",
    },
  });

  await prisma.shoppingItem.upsert({
    where:  { id: ID.shopItem.fettuccine },
    update: {},
    create: {
      id: ID.shopItem.fettuccine,
      shoppingListId: ID.shopList.pasta,
      ingredientId:   ID.ing.pastaFettuccine,
      recipeId:       ID.recipe.pasta,
      name: "fettuccine", quantity: 6, unit: "oz",
      isChecked: false,
    },
  });

  await prisma.shoppingItem.upsert({
    where:  { id: ID.shopItem.cream },
    update: {},
    create: {
      id: ID.shopItem.cream,
      shoppingListId: ID.shopList.pasta,
      ingredientId:   ID.ing.pastaCream,
      recipeId:       ID.recipe.pasta,
      name: "heavy cream", quantity: 1, unit: "cup",
      isChecked: false,
    },
  });

  await prisma.shoppingItem.upsert({
    where:  { id: ID.shopItem.garlic },
    update: {},
    create: {
      id: ID.shopItem.garlic,
      shoppingListId: ID.shopList.pasta,
      ingredientId:   ID.ing.pastaGarlic,
      recipeId:       ID.recipe.pasta,
      name: "garlic", quantity: 4, unit: "cloves",
      isChecked: false,
    },
  });

  // List B — Heroes
  await prisma.shoppingList.upsert({
    where:  { id: ID.shopList.heroes },
    update: {},
    create: {
      id: ID.shopList.heroes, userId: user.id, recipeId: ID.recipe.heroes,
      name: "Pork Sausage & Pepper Heroes",
    },
  });

  await prisma.shoppingItem.upsert({
    where:  { id: ID.shopItem.potatoes },
    update: {},
    create: {
      id: ID.shopItem.potatoes,
      shoppingListId: ID.shopList.heroes,
      ingredientId:   ID.ing.heroesPotatoes,
      recipeId:       ID.recipe.heroes,
      name: "Potatoes", quantity: 12, unit: "oz",
      isChecked: true,    // already picked up
    },
  });

  await prisma.shoppingItem.upsert({
    where:  { id: ID.shopItem.peppers },
    update: {},
    create: {
      id: ID.shopItem.peppers,
      shoppingListId: ID.shopList.heroes,
      ingredientId:   ID.ing.heroesPeppers,
      recipeId:       ID.recipe.heroes,
      name: "Long green peppers", quantity: 2, unit: null,
      isChecked: false,   // still need to buy
    },
  });

  console.log("✓ Shopping lists: Pasta (3 items), Heroes (2 items — 1 checked)");
  console.log("\n🎉  Seed complete. Login: demo@recipebank.app / demo1234!");
}

// ---------------------------------------------------------------------------
// Upsert helpers
// ---------------------------------------------------------------------------

async function upsertGroup(id: string, recipeId: string, name: string, sortOrder: number) {
  await prisma.ingredientGroup.upsert({
    where:  { id },
    update: {},
    create: { id, recipeId, name, sortOrder },
  });
}

async function upsertIng(
  id: string, groupId: string, name: string,
  quantity: number | null, unit: string | null,
  preparation: string | null, isOptional: boolean, sortOrder: number,
) {
  await prisma.ingredient.upsert({
    where:  { id },
    update: {},
    create: { id, ingredientGroupId: groupId, name, quantity, unit, preparation, isOptional, sortOrder },
  });
}

/** Replaces all steps for a recipe (idempotent: deletes + recreates). */
async function upsertSteps(recipeId: string, steps: { header: string | null; body: string }[]) {
  // We key steps by recipeId+sortOrder — simpler to delete-and-recreate than
  // carry a stable ID per step (steps have no natural unique key).
  const existing = await prisma.recipeStep.count({ where: { recipeId } });
  if (existing === steps.length) return; // already seeded

  await prisma.recipeStep.deleteMany({ where: { recipeId } });
  await prisma.recipeStep.createMany({
    data: steps.map((s, i) => ({
      recipeId,
      sectionHeader: s.header,
      body: s.body,
      sortOrder: i,
    })),
  });
}

// ---------------------------------------------------------------------------

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
