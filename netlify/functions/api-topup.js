exports.handler = async (event) => {
  const PAKASIR_API_KEY = process.env.PAKASIR_KEY;
  const PROJECT_SLUG = "cantarella";

  try {
    const { action } = event.queryStringParameters;

    if (action === "create") {
      const { amount, order_id } = JSON.parse(event.body);

      const res = await fetch("https://app.pakasir.com/api/transactioncreate/qris", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: PROJECT_SLUG,
          order_id: order_id,
          amount: amount,
          api_key: PAKASIR_API_KEY
        })
      });

      const data = await res.json();

      if (!res.ok || !data.payment) {
        return {
          statusCode: 200,
          body: JSON.stringify({ success: false, message: data.message || "Gagal membuat transaksi di Pakasir." })
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: data.payment })
      };
    }

    if (action === "status") {
      const { order_id, amount } = event.queryStringParameters;

      const url = `https://app.pakasir.com/api/transactiondetail?project=${PROJECT_SLUG}&amount=${amount}&order_id=${order_id}&api_key=${PAKASIR_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.transaction) {
        return {
          statusCode: 200,
          body: JSON.stringify({ success: false, message: data.message || "Transaksi belum ditemukan." })
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: data.transaction })
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Aksi tidak dikenal" }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
