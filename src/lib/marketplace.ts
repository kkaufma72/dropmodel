import { prisma } from "@/lib/db";
import type {
  BotCategory,
  BotVisibility,
  BotAccessType,
} from "@/generated/prisma/client";

// ─── Types ───────────────────────────────────────────────

export interface PublishBotInput {
  slug: string;
  displayName: string;
  shortDescription: string;
  longDescription?: string;
  category: BotCategory;
  tags?: string[];
  iconUrl?: string;
  coverImageUrl?: string;
  visibility?: BotVisibility;
  accessType?: BotAccessType;
  monthlyPrice?: number;
  trialQueries?: number;
}

export interface ReviewInput {
  rating: number;
  title?: string;
  body?: string;
}

export interface BotAccessResult {
  hasAccess: boolean;
  reason:
    | "free"
    | "creator"
    | "subscribed"
    | "trial"
    | "trial_expired"
    | "no_subscription"
    | "unauthenticated";
  trialRemaining?: number;
}

// ─── Helpers ─────────────────────────────────────────────

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

function validateSlug(slug: string): string | null {
  if (!slug || slug.length < 3 || slug.length > 60) {
    return "Slug must be 3–60 characters";
  }
  if (!SLUG_REGEX.test(slug)) {
    return "Slug must be lowercase alphanumeric with hyphens, cannot start/end with a hyphen";
  }
  return null;
}

// ─── publishBot ──────────────────────────────────────────
// Validates ownership, slug uniqueness, project readiness,
// and creates or updates a PublishedBot listing.

export async function publishBot(
  projectId: string,
  userId: string,
  listing: PublishBotInput
) {
  // 1. Validate slug format
  const slugError = validateSlug(listing.slug);
  if (slugError) {
    return { error: slugError, code: "INVALID_SLUG" as const };
  }

  // 2. Check slug uniqueness (excluding current project's listing)
  const existingSlug = await prisma.publishedBot.findUnique({
    where: { slug: listing.slug },
    select: { id: true, projectId: true },
  });
  if (existingSlug && existingSlug.projectId !== projectId) {
    return { error: "Slug already taken", code: "SLUG_TAKEN" as const };
  }

  // 3. Verify project ownership + readiness
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      _count: { select: { dataSources: true } },
      publishedBot: { select: { id: true } },
    },
  });

  if (!project) {
    return { error: "Project not found", code: "NOT_FOUND" as const };
  }
  if (project.status !== "READY") {
    return {
      error: "Project must be in READY status to publish",
      code: "NOT_READY" as const,
    };
  }
  if (project._count.dataSources === 0) {
    return {
      error: "Project must have at least one data source to publish",
      code: "NO_DATA" as const,
    };
  }

  // 4. Paid bot validations
  const accessType = listing.accessType ?? "FREE";
  if (accessType === "PAID") {
    if (!listing.monthlyPrice || listing.monthlyPrice <= 0) {
      return {
        error: "Paid bots require a positive monthly price",
        code: "INVALID_PRICE" as const,
      };
    }
  }

  // 5. Create or update the listing
  const data = {
    slug: listing.slug,
    displayName: listing.displayName,
    shortDescription: listing.shortDescription,
    longDescription: listing.longDescription ?? null,
    category: listing.category,
    tags: listing.tags ?? [],
    iconUrl: listing.iconUrl ?? null,
    coverImageUrl: listing.coverImageUrl ?? null,
    visibility: listing.visibility ?? "PUBLIC",
    accessType,
    monthlyPrice: accessType === "PAID" ? listing.monthlyPrice : null,
    trialQueries: listing.trialQueries ?? 5,
  };

  if (project.publishedBot) {
    // Update existing
    const bot = await prisma.publishedBot.update({
      where: { projectId },
      data,
    });
    return { bot, created: false };
  }

  // Create new
  const bot = await prisma.publishedBot.create({
    data: {
      ...data,
      projectId,
      creatorId: userId,
    },
  });
  return { bot, created: true };
}

// ─── forkBot ─────────────────────────────────────────────
// Copies project config (NOT data/vectors) to a new project
// owned by the forking user. Creates a BotFork record and
// increments the forkCount on the published bot.

export async function forkBot(publishedBotId: string, userId: string) {
  // 1. Get the published bot with its project + config
  const publishedBot = await prisma.publishedBot.findUnique({
    where: { id: publishedBotId },
    include: {
      project: {
        include: { config: true },
      },
    },
  });

  if (!publishedBot) {
    return { error: "Bot not found", code: "NOT_FOUND" as const };
  }

  // 2. Don't allow forking your own bot
  if (publishedBot.creatorId === userId) {
    return { error: "Cannot fork your own bot", code: "SELF_FORK" as const };
  }

  // 3. Check visibility — only PUBLIC and UNLISTED can be forked
  if (publishedBot.visibility === "PRIVATE") {
    return { error: "This bot is private", code: "PRIVATE" as const };
  }

  const source = publishedBot.project;

  // 4. Create the new project (copies config, NOT data/vectors)
  const forkedProject = await prisma.project.create({
    data: {
      userId,
      name: `${publishedBot.displayName} (fork)`,
      description: source.description,
      modelConfig: source.modelConfig ?? undefined,
      customization: source.customization ?? undefined,
      // Config clone
      ...(source.config
        ? {
            config: {
              create: {
                useCase: source.config.useCase,
                useCaseCustom: source.config.useCaseCustom,
                companyName: source.config.companyName,
                industry: source.config.industry,
                tone: source.config.tone,
                failureBehavior: source.config.failureBehavior,
                contactInfo: source.config.contactInfo,
                collectFields: source.config.collectFields,
                restrictions: source.config.restrictions,
                customRules: source.config.customRules,
                language: source.config.language,
                responseLength: source.config.responseLength,
                generatedPrompt: source.config.generatedPrompt,
              },
            },
          }
        : {}),
    },
  });

  // 5. Create fork record + increment forkCount in a transaction-like update
  const [fork] = await Promise.all([
    prisma.botFork.create({
      data: {
        userId,
        sourcePublishedBotId: publishedBotId,
        targetProjectId: forkedProject.id,
      },
    }),
    prisma.publishedBot.update({
      where: { id: publishedBotId },
      data: { forkCount: { increment: 1 } },
    }),
  ]);

  return { fork, project: forkedProject };
}

// ─── toggleStar ──────────────────────────────────────────
// Toggles a star on a published bot. Returns the new starred
// state and updated star count.

export async function toggleStar(publishedBotId: string, userId: string) {
  // Check the bot exists
  const bot = await prisma.publishedBot.findUnique({
    where: { id: publishedBotId },
    select: { id: true },
  });
  if (!bot) {
    return { error: "Bot not found", code: "NOT_FOUND" as const };
  }

  // Check if already starred
  const existing = await prisma.botStar.findUnique({
    where: {
      userId_publishedBotId: { userId, publishedBotId },
    },
  });

  if (existing) {
    // Un-star
    await Promise.all([
      prisma.botStar.delete({ where: { id: existing.id } }),
      prisma.publishedBot.update({
        where: { id: publishedBotId },
        data: { starCount: { decrement: 1 } },
      }),
    ]);

    const updated = await prisma.publishedBot.findUnique({
      where: { id: publishedBotId },
      select: { starCount: true },
    });

    return { starred: false, starCount: updated?.starCount ?? 0 };
  }

  // Star
  await Promise.all([
    prisma.botStar.create({
      data: { userId, publishedBotId },
    }),
    prisma.publishedBot.update({
      where: { id: publishedBotId },
      data: { starCount: { increment: 1 } },
    }),
  ]);

  const updated = await prisma.publishedBot.findUnique({
    where: { id: publishedBotId },
    select: { starCount: true },
  });

  return { starred: true, starCount: updated?.starCount ?? 0 };
}

// ─── submitReview ────────────────────────────────────────
// Upserts a review (one per user per bot). Recalculates the
// denormalized avgRating and ratingCount on the bot.

export async function submitReview(
  publishedBotId: string,
  userId: string,
  review: ReviewInput
) {
  // Validate rating
  if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
    return {
      error: "Rating must be an integer between 1 and 5",
      code: "INVALID_RATING" as const,
    };
  }

  // Check the bot exists
  const bot = await prisma.publishedBot.findUnique({
    where: { id: publishedBotId },
    select: { id: true, creatorId: true },
  });
  if (!bot) {
    return { error: "Bot not found", code: "NOT_FOUND" as const };
  }

  // Can't review your own bot
  if (bot.creatorId === userId) {
    return {
      error: "Cannot review your own bot",
      code: "SELF_REVIEW" as const,
    };
  }

  // Upsert the review
  const upserted = await prisma.botReview.upsert({
    where: {
      userId_publishedBotId: { userId, publishedBotId },
    },
    create: {
      userId,
      publishedBotId,
      rating: review.rating,
      title: review.title ?? null,
      body: review.body ?? null,
    },
    update: {
      rating: review.rating,
      title: review.title ?? null,
      body: review.body ?? null,
    },
  });

  // Recalculate aggregate stats
  const agg = await prisma.botReview.aggregate({
    where: { publishedBotId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await prisma.publishedBot.update({
    where: { id: publishedBotId },
    data: {
      avgRating: Math.round((agg._avg.rating ?? 0) * 100) / 100,
      ratingCount: agg._count.rating,
    },
  });

  return { review: upserted };
}

// ─── checkBotAccess ──────────────────────────────────────
// Determines whether a user can query a published bot.
// FREE bots are always accessible. PAID bots check for
// creator status, active subscription, or remaining trial.

export async function checkBotAccess(
  publishedBotId: string,
  userId?: string | null
): Promise<BotAccessResult> {
  const bot = await prisma.publishedBot.findUnique({
    where: { id: publishedBotId },
    select: {
      accessType: true,
      creatorId: true,
      trialQueries: true,
    },
  });

  if (!bot) {
    return { hasAccess: false, reason: "no_subscription" };
  }

  // FREE bots — always accessible
  if (bot.accessType === "FREE") {
    return { hasAccess: true, reason: "free" };
  }

  // PAID bot — need auth
  if (!userId) {
    return { hasAccess: false, reason: "unauthenticated" };
  }

  // Creator always has access
  if (bot.creatorId === userId) {
    return { hasAccess: true, reason: "creator" };
  }

  // Check for active subscription
  const subscription = await prisma.botSubscription.findUnique({
    where: {
      userId_publishedBotId: { userId, publishedBotId },
    },
  });

  if (subscription && subscription.status === "ACTIVE") {
    return { hasAccess: true, reason: "subscribed" };
  }

  // Check trial — trial is based on a subscription record with queriesUsed
  if (subscription) {
    // Has a subscription record but not ACTIVE — might be cancelled
    if (subscription.queriesUsed < bot.trialQueries) {
      return {
        hasAccess: true,
        reason: "trial",
        trialRemaining: bot.trialQueries - subscription.queriesUsed,
      };
    }
    return { hasAccess: false, reason: "trial_expired" };
  }

  // No subscription record at all — create trial subscription
  await prisma.botSubscription.create({
    data: {
      userId,
      publishedBotId,
      status: "CANCELLED", // not truly subscribed, just tracking trial
      queriesUsed: 0,
    },
  });

  return {
    hasAccess: true,
    reason: "trial",
    trialRemaining: bot.trialQueries,
  };
}
