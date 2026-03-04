import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "test@dropmodel.com" },
    update: {},
    create: {
      email: "test@dropmodel.com",
      name: "Test User",
      image: null,
      plan: "FREE",
      projects: {
        create: {
          name: "My First Chatbot",
          description: "A demo project to explore DropModel features.",
          status: "READY",
          modelConfig: {
            temperature: 0.7,
            systemPrompt: "You are a helpful assistant.",
            maxTokens: 1024,
          },
          customization: {
            chatbotColor: "#6366f1",
            welcomeMessage: "Hi! How can I help you today?",
            logo: null,
          },
          queryCount: 0,
          queryLimit: 50,
        },
      },
    },
    include: { projects: true },
  });

  console.log("🌱 Seeded user:", user.email);
  console.log("   └─ Project:", user.projects[0].name, `(apiKey: ${user.projects[0].apiKey})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
