import { notFound } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/db";
import { ProjectDetailClient } from "./project-detail-client";

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const session = await getSession();
  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: {
      dataSources: {
        orderBy: { createdAt: "desc" },
      },
      config: true,
      _count: {
        select: { chatMessages: true, corrections: true },
      },
    },
  });

  if (!project) notFound();

  // Serialize for client
  const serialized = {
    id: project.id,
    name: project.name,
    status: project.status,
    apiKey: project.apiKey,
    queryCount: project.queryCount,
    queryLimit: project.queryLimit,
    modelConfig: project.modelConfig as Record<string, unknown>,
    customization: project.customization as Record<string, unknown>,
    messageCount: project._count.chatMessages,
    correctionCount: project._count.corrections,
    createdAt: project.createdAt.toISOString(),
    dataSources: project.dataSources.map((ds) => ({
      id: ds.id,
      fileName: ds.fileName,
      fileType: ds.fileType,
      fileSize: ds.fileSize,
      chunkCount: ds.chunkCount,
      status: ds.status,
      errorMessage: ds.errorMessage,
      createdAt: ds.createdAt.toISOString(),
    })),
    config: project.config
      ? {
          useCase: project.config.useCase,
          useCaseCustom: project.config.useCaseCustom,
          companyName: project.config.companyName,
          industry: project.config.industry,
          tone: project.config.tone,
          failureBehavior: project.config.failureBehavior,
          contactInfo: project.config.contactInfo,
          collectFields: project.config.collectFields,
          restrictions: project.config.restrictions,
          customRules: project.config.customRules,
          language: project.config.language,
          responseLength: project.config.responseLength,
          generatedPrompt: project.config.generatedPrompt,
          promptVersion: project.config.promptVersion,
        }
      : null,
  };

  return <ProjectDetailClient project={serialized} />;
}
