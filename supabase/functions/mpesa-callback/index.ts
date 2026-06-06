import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Shared-secret validation: callback URL must include ?secret=<MPESA_CALLBACK_SECRET>
    const expectedSecret = Deno.env.get("MPESA_CALLBACK_SECRET");
    if (expectedSecret) {
      const url = new URL(req.url);
      const provided = url.searchParams.get("secret");
      if (provided !== expectedSecret) {
        console.warn("M-Pesa callback rejected: invalid or missing secret");
        return new Response(JSON.stringify({ success: false }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("MPESA_CALLBACK_SECRET is not set — callback endpoint is unauthenticated. Set it to enable shared-secret verification.");
    }

    const body = await req.json();
    console.log("M-Pesa callback received");

    const callback = body?.Body?.stkCallback;
    if (!callback) {
      return new Response(JSON.stringify({ success: false }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const checkoutRequestId = callback.CheckoutRequestID;
    const resultCode = callback.ResultCode;
    const resultDesc = callback.ResultDesc;

    let mpesaReceiptNumber: string | null = null;

    if (resultCode === 0 && callback.CallbackMetadata?.Item) {
      for (const item of callback.CallbackMetadata.Item) {
        if (item.Name === "MpesaReceiptNumber") {
          mpesaReceiptNumber = item.Value;
        }
      }
    }

    const status = resultCode === 0 ? "completed" : "failed";

    // Idempotency guard: only update payments still in 'pending'
    const { data: payment, error: updateError } = await supabase
      .from("mpesa_payments")
      .update({
        result_code: resultCode,
        result_desc: resultDesc,
        mpesa_receipt_number: mpesaReceiptNumber,
        status,
      })
      .eq("checkout_request_id", checkoutRequestId)
      .eq("status", "pending")
      .select("order_id, organization_id, amount")
      .maybeSingle();

    if (updateError) {
      console.error("Update error:", updateError);
    }

    if (!payment) {
      // Already processed or unknown — ignore silently
      return new Response(JSON.stringify({ success: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === "completed" && payment?.order_id) {
      await supabase
        .from("orders")
        .update({ status: "completed" })
        .eq("id", payment.order_id);

      await supabase.from("activity_logs").insert({
        organization_id: payment.organization_id,
        action: "mpesa_payment_received",
        metadata: {
          order_id: payment.order_id,
          amount: payment.amount,
          receipt: mpesaReceiptNumber,
        },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("M-Pesa callback error:", error);
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
