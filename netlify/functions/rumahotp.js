const axios = require('axios');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const apiKey = process.env.RUMAHOTP_API_KEY;
  const { action, service_id, operator_id, order_id } = event.queryStringParameters;

  try {
    // 1. JALUR PESAN NOMOR BARU
    if (action === 'order') {
      const response = await axios.get('https://www.rumahotp.io/api/v2/orders', {
        headers: { 'x-apikey': apiKey },
        params: {
          service_id: service_id || '1',
          operator_id: operator_id || 'any'
        }
      });
      return { statusCode: 200, headers, body: JSON.stringify(response.data) };
    }

    // 2. JALUR CEK STATUS OTP
    if (action === 'status') {
      if (!order_id) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Butuh order_id' }) };
      }
      const response = await axios.get('https://www.rumahotp.io/api/v1/orders/get_status', {
        headers: { 'x-apikey': apiKey },
        params: { id: order_id }
      });
      return { statusCode: 200, headers, body: JSON.stringify(response.data) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Action tidak valid' }) };

  } catch (error) {
    return {
      statusCode: error.response ? error.response.status : 500,
      headers,
      body: JSON.stringify({ error: error.message, detail: error.response?.data })
    };
  }
};
