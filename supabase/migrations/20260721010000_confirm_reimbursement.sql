-- Database Migration: Add Host Confirmation for Reimbursements
ALTER TABLE public.cart_contributions
  ADD COLUMN IF NOT EXISTS reimbursement_confirmed boolean NOT NULL DEFAULT false;
