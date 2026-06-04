export default async function handler(req, res) {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: "Missing start or end query parameters" });
  }

  const key = process.env.REACT_APP_ORS_KEY;
  if (!key) {
    return res.status(500).json({ error: "REACT_APP_ORS_KEY environment variable is not configured" });
  }

  const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${key}&start=${start}&end=${end}`;

  try {
    const apiRes = await fetch(url);
    if (!apiRes.ok) {
      let body = "";
      try {
        body = await apiRes.text();
      } catch (e) {
        body = e.message;
      }
      return res.status(apiRes.status).json({
        status: apiRes.status,
        statusText: apiRes.statusText,
        body
      });
    }
    const data = await apiRes.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
