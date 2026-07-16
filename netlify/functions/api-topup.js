exports.handler = async (event) => {
  const PAKASIR_KEY = process.env.PAKASIR_KEY;

  try {
    const { action } = event.queryStringParameters;

    if (action === "create") {
      const body = JSON.parse(event.body);
      const res = await fetch("https://api.pakasir.com/v1/bills", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${PAKASIR_KEY}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      return { statusCode: 200, body: JSON.stringify(data) };
    }

    if (action === "status") {
      const { id } = event.queryStringParameters;
      const res = await fetch(`https://api.pakasir.com/v1/bills/${id}`, {
        headers: { "Authorization": `Bearer ${PAKASIR_KEY}` }
      });
      const data = await res.json();
      return { statusCode: 200, body: JSON.stringify(data) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Aksi tidak dikenal" }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
