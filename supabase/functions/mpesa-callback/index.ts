
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
    const body = await req.json();
    console.log("M-Pesa callback received:", JSON.stringify(body));

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

    // Update the payment record
    const { data: payment, error: updateError } = await supabase
      .from("mpesa_payments")
      .update({
        result_code: resultCode,
        result_desc: resultDesc,
        mpesa_receipt_number: mpesaReceiptNumber,
        status,
      })
      .eq("checkout_request_id", checkoutRequestId)
      .select("order_id, organization_id, amount")
      .single();

    if (updateError) {
      console.error("Update error:", updateError);
    }

    // If payment succeeded and linked to an order, mark order completed
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
