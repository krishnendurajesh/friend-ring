-- Database Migration: Adjust approvals transition flow
-- This triggers transition from 'editing' directly to 'locked' when everyone has approved, starting the 1-hour payment timer.

CREATE OR REPLACE FUNCTION public.check_cart_approvals_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_ring_id uuid;
  v_receiver_user_id uuid;
  v_host_user_id uuid;
  v_total_members int;
  v_approved_members int;
  v_status text;
  v_ring_name text;
BEGIN
  -- Get ring_id, status, receiver, and host of the cart
  SELECT ring_id, status, receiver_user_id, host_user_id 
  INTO v_ring_id, v_status, v_receiver_user_id, v_host_user_id
  FROM public.carts 
  WHERE id = NEW.cart_id;

  -- If the cart is not in 'editing' state, do nothing
  IF v_status != 'editing' THEN
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

  -- If all accepted members approved, transition cart to locked and set locked_at (starts 1-hour countdown)
  IF v_total_members > 0 AND v_total_members = v_approved_members THEN
    UPDATE public.carts
    SET status = 'locked',
        locked_at = now()
    WHERE id = NEW.cart_id AND status = 'editing';

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
