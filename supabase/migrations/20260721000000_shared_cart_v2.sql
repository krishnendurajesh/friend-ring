-- Database Migration: FriendRing Shared Cart & Reimbursement Flow Updates

-- 1. Alter carts table to add new columns
ALTER TABLE public.carts
  ADD COLUMN IF NOT EXISTS host_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;

-- 2. Update status check constraint on carts table to be backward compatible but support new states
ALTER TABLE public.carts DROP CONSTRAINT IF EXISTS carts_status_check;
ALTER TABLE public.carts ADD CONSTRAINT carts_status_check CHECK (
  status IN ('editing', 'locked', 'ready_for_payment', 'completed', 'expired_reverted', 'pending_payment')
);

-- 3. Trigger Function: Automatically assign Host on first item added to a cart
CREATE OR REPLACE FUNCTION public.assign_cart_host_on_item_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.carts
  SET host_user_id = NEW.added_by_user_id
  WHERE id = NEW.cart_id AND host_user_id IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Execute Host assignment trigger after insert on cart_items
CREATE OR REPLACE TRIGGER on_cart_item_added
  AFTER INSERT ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.assign_cart_host_on_item_insert();

-- 4. Trigger Function: Reset approvals and revert status back to 'editing' on item change
CREATE OR REPLACE FUNCTION public.reset_cart_approvals_on_item_change()
RETURNS TRIGGER AS $$
DECLARE
  v_cart_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_cart_id := OLD.cart_id;
  ELSE
    v_cart_id := NEW.cart_id;
  END IF;

  -- Reset all approvals for this cart to false
  UPDATE public.cart_approvals
  SET approved = false
  WHERE cart_id = v_cart_id;

  -- Revert status back to editing if it is not completed
  UPDATE public.carts
  SET status = 'editing',
      locked_at = NULL,
      payment_window_started_at = NULL
  WHERE id = v_cart_id AND status IN ('pending_payment', 'locked', 'ready_for_payment', 'expired_reverted');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger Function: Transition cart to ready_for_payment when all accepted members approve (consensus)
CREATE OR REPLACE FUNCTION public.check_cart_approvals_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_ring_id uuid;
  v_receiver_user_id uuid;
  v_host_user_id uuid;
  v_total_members int;
  v_approved_members int;
  v_status text;
  v_locked_at timestamptz;
  v_ring_name text;
BEGIN
  -- Get ring_id, status, receiver, host, and locked_at of the cart
  SELECT ring_id, status, receiver_user_id, host_user_id, locked_at 
  INTO v_ring_id, v_status, v_receiver_user_id, v_host_user_id, v_locked_at
  FROM public.carts 
  WHERE id = NEW.cart_id;

  -- If the cart is not in 'locked' state, do nothing
  IF v_status != 'locked' THEN
    RETURN NEW;
  END IF;

  -- Check if locked_at has expired (timer > 1 hour)
  IF v_locked_at IS NULL OR v_locked_at < now() - INTERVAL '1 hour' THEN
    -- Revert cart status to editing
    UPDATE public.carts
    SET status = 'editing',
        locked_at = NULL
    WHERE id = NEW.cart_id;
    
    UPDATE public.cart_approvals
    SET approved = false
    WHERE cart_id = NEW.cart_id;

    RETURN NEW;
  END IF;

  -- Count accepted members in the ring (excluding the receiver if there is one)
  SELECT count(*) INTO v_total_members
  FROM public.ring_members
  WHERE ring_id = v_ring_id 
    AND status = 'accepted'
    AND (v_receiver_user_id IS NULL OR user_id != v_receiver_user_id);

  -- Count approved members for this cart
  SELECT count(*) INTO v_approved_members
  FROM public.cart_approvals
  WHERE cart_id = NEW.cart_id AND approved = true;

  -- If all accepted members approved, transition cart to ready_for_payment and notify Host
  IF v_total_members > 0 AND v_total_members = v_approved_members THEN
    UPDATE public.carts
    SET status = 'ready_for_payment',
        payment_window_started_at = now()
    WHERE id = NEW.cart_id AND status = 'locked';

    -- Notify the Host
    IF v_host_user_id IS NOT NULL THEN
      SELECT name INTO v_ring_name FROM public.rings WHERE id = v_ring_id;
      
      INSERT INTO public.notifications (user_id, type, payload)
      VALUES (
        v_host_user_id,
        'cart_ready_for_payment',
        jsonb_build_object(
          'message', '🎉 All members approved the cart! You can now checkout upfront as the Host for Ring "' || coalesce(v_ring_name, 'your Ring') || '".',
          'cart_id', NEW.cart_id,
          'ring_id', v_ring_id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
