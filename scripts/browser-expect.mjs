import {expect as baseExpect} from '@playwright/test';

/** Matches browser action readiness budgets while cold pages and document workers initialise. */
export const expect=baseExpect.configure({timeout:30000});
