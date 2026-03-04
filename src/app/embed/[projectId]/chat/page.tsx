import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EmbedChatClient } from "./embed-chat-client";

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function EmbedChatPage({ params }: Props) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      status: true,
      apiKey: true,
      customization: true,
    },
  });

  if (!project) notFound();

  const custom = project.customization as Record<string, unknown>;

  return (
    <EmbedChatClient
      projectId={project.id}
      projectName={project.name}
      projectStatus={project.status}
      apiKey={project.apiKey}
      accentColor={(custom.chatbotColor as string) || "#7c3aed"}
      welcomeMessage={
        (custom.welcomeMessage as string) ||
        "Hi! Ask me anything about our docs."
      }
    />
  );
}
