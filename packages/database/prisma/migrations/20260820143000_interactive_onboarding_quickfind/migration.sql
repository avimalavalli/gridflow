ALTER TABLE "ProductExperienceProgress"
  DROP CONSTRAINT IF EXISTS "ProductExperienceProgress_tutorialStep_check";

ALTER TABLE "ProductExperienceProgress"
  ADD CONSTRAINT "ProductExperienceProgress_tutorialStep_check"
  CHECK ("tutorialStep" BETWEEN 0 AND 11);

ALTER TABLE "ProductExperienceProgress"
  DROP CONSTRAINT IF EXISTS "ProductExperienceProgress_onboardingStep_check";

ALTER TABLE "ProductExperienceProgress"
  ADD CONSTRAINT "ProductExperienceProgress_onboardingStep_check"
  CHECK ("onboardingStep" BETWEEN 0 AND 6);
