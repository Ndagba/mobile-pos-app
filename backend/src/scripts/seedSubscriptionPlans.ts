import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedSubscriptionPlans() {
  try {
    console.log('Seeding subscription plans...');

    // Business Plan: ₦12,500/month, 1 branch
    const businessPlan = await prisma.subscriptionPlan.upsert({
      where: { slug: 'business' },
      update: {},
      create: {
        name: 'Business',
        slug: 'business',
        max_branches: 1,
        monthly_price: 12500,
        is_active: true,
        features: {
          transaction_creation: true,
          inventory_management: true,
          customer_management: true,
          basic_analytics: true,
          single_branch: true,
          api_access: false,
        },
      },
    });

    console.log('✓ Business plan created/updated:', businessPlan);

    // Pro Plan: ₦24,000/month, unlimited branches
    const proPlan = await prisma.subscriptionPlan.upsert({
      where: { slug: 'pro' },
      update: {},
      create: {
        name: 'Pro',
        slug: 'pro',
        max_branches: null, // unlimited
        monthly_price: 24000,
        is_active: true,
        features: {
          transaction_creation: true,
          inventory_management: true,
          customer_management: true,
          advanced_analytics: true,
          unlimited_branches: true,
          api_access: true,
          batch_tracking: true,
          priority_support: true,
        },
      },
    });

    console.log('✓ Pro plan created/updated:', proPlan);

    console.log('✓ Subscription plans seeded successfully!');
  } catch (error) {
    console.error('Error seeding subscription plans:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedSubscriptionPlans();
