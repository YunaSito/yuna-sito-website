// Netlify serverless function: proxies URA's Property Market Information
// (PMI_Resi_Transaction) service so the access key never reaches the browser.
//
// GET /.netlify/functions/ura
//
// Requires the environment variable URA_KEY to be set in Netlify site settings.

const TOKEN_URL = 'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1';
const DATA_URL = 'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1?service=PMI_Resi_Transaction&batch=1';

// URA's batch response covers a full year of Singapore-wide transactions
// (tens of thousands of records, several MB) — far more than a browser
// widget needs. Flatten it and keep only the most recent MAX_TRANSACTIONS
// so the response stays small and fast to fetch/parse client-side.
const MAX_TRANSACTIONS = 500;

function flattenAndTrim(data) {
  const items = Array.isArray(data.Result) ? data.Result : [];
  const flat = [];
  items.forEach((item) => {
    const project = item.project || 'Unknown Project';
    (item.transaction || []).forEach((t) => {
      flat.push({
        project,
        district: t.district || null,
        price: Number(t.price) || null,
        area: Number(t.area) || null,
        contractDate: t.contractDate || null,
      });
    });
  });

  flat.sort((a, b) => {
    const keyOf = (d) => (d && d.length === 4 ? d.slice(2, 4) + d.slice(0, 2) : '');
    return keyOf(b.contractDate).localeCompare(keyOf(a.contractDate));
  });

  return { total: flat.length, transactions: flat.slice(0, MAX_TRANSACTIONS) };
}

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
    const trimmed = flattenAndTrim(data);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(trimmed),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
