// Netlify serverless function: proxies URA's Property Market Information
// (PMI_Resi_Transaction) service so the access key never reaches the browser.
//
// GET /.netlify/functions/ura
//
// Requires the environment variable URA_KEY to be set in Netlify site settings.

const TOKEN_URL = 'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1';
const DATA_URL = 'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1?service=PMI_Resi_Transaction&batch=1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const accessKey = process.env.URA_KEY;
  if (!accessKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'URA_KEY environment variable is not set on this Netlify site.' }),
    };
  }

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      headers: { AccessKey: accessKey },
    });
    if (!tokenRes.ok) {
      throw new Error(`URA token request failed: ${tokenRes.status} ${tokenRes.statusText}`);
    }
    const tokenJson = await tokenRes.json();
    const token = tokenJson.Result;
    if (!token) {
      throw new Error('URA token endpoint did not return a token.');
    }

    const dataRes = await fetch(DATA_URL, {
      headers: { AccessKey: accessKey, Token: token },
    });
    if (!dataRes.ok) {
      throw new Error(`URA data request failed: ${dataRes.status} ${dataRes.statusText}`);
    }
    const data = await dataRes.json();

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
