ALTER TABLE "ProductExperienceProgress"
  ADD COLUMN "setupDismissedAt" TIMESTAMPTZ(3);

ALTER TABLE "AutomationControlPolicy"
  ADD COLUMN "pauseUntil" TIMESTAMPTZ(3);
