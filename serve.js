require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { WebpayPlus, Options, IntegrationApiKeys, Environment } = require('transbank-sdk');

const app = express();

// 1. MEDIDAS DE SEGURIDAD WEB
app.use(helmet()); // Encabezados HTTP seguros
app.use(express.json());

// Restringir CORS únicamente a la URL oficial del cliente
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://tu-cliente-dominio.com'
}));

// Prevenir ataques de fuerza bruta / saturación (Rate Limiting)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // Máximo 100 peticiones por IP
});
app.use(limiter);

// 2. CONFIGURACIÓN DE WEBPAY PLUS (Entorno de integración o producción)
const tx = new WebpayPlus.Transaction(
  new Options(
    process.env.WEBPAY_COMMERCE_CODE || IntegrationApiKeys.WEBPAY,
    process.env.WEBPAY_API_KEY || IntegrationApiKeys.WEBPAY,
    process.env.NODE_ENV === 'production' ? Environment.Production : Environment.Integration
  )
);

// 3. RUTAS SEGURAS
app.post('/api/pay/init', async (req, res) => {
  try {
    const { serviceId, userName, userEmail, slot } = req.body;

    // Mapeo seguro de precios desde el servidor (NUNCA confiar en precios enviados por el cliente)
    const services = {
      "1": { name: "Carta natal completa", deposit: 15000 },
      "2": { name: "Sinastría de pareja", deposit: 20000 },
      "3": { name: "Tránsitos del año", deposit: 12000 }
    };

    const selectedService = services[serviceId];
    if (!selectedService) {
      return res.status(400).json({ error: "Servicio no válido" });
    }

    const buyOrder = `ORD-${Date.now()}`;
    const sessionId = `SESS-${Math.floor(Math.random() * 1000000)}`;
    const amount = selectedService.deposit;
    const returnUrl = `${process.env.BACKEND_URL}/api/pay/confirm`;

    // Iniciar transacción en Transbank
    const createResponse = await tx.create(buyOrder, sessionId, amount, returnUrl);

    res.json({
      url: createResponse.url,
      token: createResponse.token
    });

  } catch (error) {
    console.error("Error Webpay Init:", error);
    res.status(500).json({ error: "Error interno al procesar el pago" });
  }
});

// Confirmación del pago redirigida por Transbank
app.post('/api/pay/confirm', async (req, res) => {
  try {
    const { token_ws } = req.body;
    const commitResponse = await tx.commit(token_ws);

    if (commitResponse.status === 'AUTHORIZED') {
      // Guardar reserva en BD, enviar correo al cliente, etc.
      res.redirect(`${process.env.FRONTEND_URL}/confirmacion.html?status=success&buyOrder=${commitResponse.buy_order}`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/confirmacion.html?status=rejected`);
    }
  } catch (error) {
    res.redirect(`${process.env.FRONTEND_URL}/confirmacion.html?status=error`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor seguro corriendo en puerto ${PORT}`));
