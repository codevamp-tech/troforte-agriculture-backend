import axios from "axios";


const API_KEY = 'api_live_fS6y4QuPkLoFRJMXdJ0788eL6ldzJ26b8qlGa8a0RCbdEYU0TajvRny6tr';
const BASE_URL = 'https://api.apitube.io/v1/news/everything';

export const getAgricultureNews = async (req, res) => {
  try {
    const response = await axios.get(BASE_URL, {
      params: {
        'category.id': 'medtop:20000210', 
        'country.code': 'au',
        'language.code': 'en',
        api_key: API_KEY
      },
      headers: {
        'Accept': 'application/json'
      }
    });

    // Transform the data to only send what the client needs
    const newsData = response.data.results.map(article => ({
      id: article.id,
      title: article.title,
      description: article.description,
      image: article.image,
      source: article.source?.domain || 'Unknown',
      publishedAt: article.published_at,
      url: article.href
    }));

    res.json({
      success: true,
      count: newsData.length,
      data: newsData
    });

  } catch (error) {
    console.error('News API Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch news articles',
      error: error.message
    });
  }
};

