const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeLinksWithClass() {
  const url = 'https://www.ibanknet.com/scripts/callreports/fiList.aspx?type=ncua';
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);

  const linksData = [];

  $('a.pagebody').each((_, a) => {
    const el = $(a);
    const href = el.attr('href');
    const text = el.text().trim();

    if (href && href.includes('ibnid=')) {
      const idMatch = href.match(/ibnid=([^&]+)/);
      const id = idMatch ? idMatch[1] : null;

      if (id) {
        linksData.push({ text, id, href: new URL(href, url).href });
      }
    }
  });

  return linksData;
}

async function updateDataFile() {
  try {
    const data = await scrapeLinksWithClass();
    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    console.log('Data updated and saved to data.json!');
  } catch (err) {
    console.error('Error during scraping:', err);
  }
}

updateDataFile();
