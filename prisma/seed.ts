import { PrismaClient, Complexity } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo1234!", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@recipebank.app" },
    update: {},
    create: {
      email: "demo@recipebank.app",
      username: "demo_user",
      displayName: "Demo Chef",
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const recipe = await prisma.recipe.upsert({
    where: { id: "seed-recipe-pasta" },
    update: {},
    create: {
      id: "seed-recipe-pasta",
      userId: user.id,
      title: "Creamy Garlic Pasta",
      description: "A cozy weeknight pasta with a silky garlic cream sauce.",
      servings: 4,
      currentServings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      complexity: Complexity.EASY,
      dishType: "pasta",
      cuisine: "Italian",
      flavorProfile: "creamy, garlicky, comforting",
      isFavorite: true,
      ingredientGroups: {
        create: [
          {
            name: "Pasta",
            sortOrder: 0,
            ingredients: {
              create: [
                {
                  quantity: 12,
                  unit: "oz",
                  name: "fettuccine",
                  sortOrder: 0,
                },
              ],
            },
          },
          {
            name: "Sauce",
            sortOrder: 1,
            ingredients: {
              create: [
                { quantity: 4, unit: "cloves", name: "garlic", preparation: "minced", sortOrder: 0 },
                { quantity: 1, unit: "cup", name: "heavy cream", sortOrder: 1 },
                { quantity: 0.5, unit: "cup", name: "parmesan", preparation: "grated", sortOrder: 2 },
                { name: "salt", unit: "to taste", sortOrder: 3 },
              ],
            },
          },
        ],
      },
      steps: {
        create: [
          {
            sectionHeader: "Cook the pasta",
            body: "Boil pasta in salted water until al dente. Reserve 1 cup pasta water.",
            sortOrder: 0,
          },
          {
            sectionHeader: "Make the sauce",
            body: "Sauté garlic in butter, add cream and simmer. Toss with pasta and parmesan.",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  console.log(`Seeded user: ${user.email}`);
  console.log(`Seeded recipe: ${recipe.title}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
