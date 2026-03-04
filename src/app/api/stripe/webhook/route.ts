import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import type { Plan } from "@/generated/prisma/client";
import type Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();
  const headerList = await headers();
  const signature = headerList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe] Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        // Unhandled event type — that's fine
        break;
    }
  } catch (err) {
    console.error(`[stripe] Error handling ${event.type}:`, err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

// ─── Handlers ─────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  if (!userId) {
    console.error("[stripe] No userId in checkout session metadata");
    return;
  }

  // Determine which plan by matching the price ID
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price?.id;

  let newPlan: Plan = "FREE";
  if (priceId === PLANS.PRO.priceId) {
    newPlan = "PRO";
  } else if (priceId === PLANS.TEAM.priceId) {
    newPlan = "TEAM";
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: newPlan,
      stripeCustomerId: customerId ?? undefined,
    },
  });

  // Update query limits on all user's projects
  const planConfig = PLANS[newPlan];
  await prisma.project.updateMany({
    where: { userId },
    data: { queryLimit: planConfig.queryLimit },
  });

  console.log(
    `[stripe] User ${userId} upgraded to ${newPlan} (customer: ${customerId})`
  );
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    // Try to find by customer ID
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

    if (customerId) {
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
      });

      if (user) {
        await downgradeToFree(user.id);
        return;
      }
    }

    console.error("[stripe] Cannot identify user for subscription deletion");
    return;
  }

  await downgradeToFree(userId);
}

async function downgradeToFree(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { plan: "FREE" },
  });

  // Reset project limits to free tier
  await prisma.project.updateMany({
    where: { userId },
    data: { queryLimit: PLANS.FREE.queryLimit },
  });

  console.log(`[stripe] User ${userId} downgraded to FREE`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  });

  console.warn(
    `[stripe] Payment failed for customer ${customerId}${user ? ` (user: ${user.id}, ${user.email})` : ""}`
  );

  // Future: send notification email, show in-app banner, etc.
}
