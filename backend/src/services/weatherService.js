/**
 * Real-Time Weather Service
 * Fetches current weather data for SLIIT Malabe Campus
 * Uses Open-Meteo API (FREE, no API key needed!)
 * API Docs: https://open-meteo.com/en/docs
 */

const axios = require('axios');

class WeatherService {
  constructor() {
    // SLIIT Malabe Campus coordinates
    this.latitude = 6.914831936575134;
    this.longitude = 79.97288012698459;

    // Open-Meteo API (FREE, no key needed!)
    this.apiUrl = 'https://api.open-meteo.com/v1/forecast';

    // Cache weather data for 10 minutes (reduce API calls)
    this.cache = {
      data: null,
      timestamp: null,
      ttl: 10 * 60 * 1000 // 10 minutes
    };

    console.log('🌤️  Weather Service initialized with Open-Meteo API (FREE)');
  }

  /**
   * Get current weather condition
   * Returns: 'sunny', 'rainy', 'cloudy', 'stormy'
   */
  async getCurrentWeather() {
    // Check cache first
    if (this.isCacheValid()) {
      return this.cache.data.condition;
    }

    try {
      // Open-Meteo API call (FREE!)
      const response = await axios.get(this.apiUrl, {
        params: {
          latitude: this.latitude,
          longitude: this.longitude,
          current: 'temperature_2m,relative_humidity_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m',
          timezone: 'Asia/Colombo'
        },
        timeout: 5000
      });

      const current = response.data.current;
      const weatherCondition = this.mapOpenMeteoCondition(current);

      // Update cache with full weather data
      this.cache.data = {
        condition: weatherCondition,
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        precipitation: current.precipitation,
        rain: current.rain,
        cloudCover: current.cloud_cover,
        windSpeed: current.wind_speed_10m,
        weatherCode: current.weather_code,
        timestamp: current.time
      };
      this.cache.timestamp = Date.now();

      console.log(`🌤️  Weather updated: ${weatherCondition} (${current.temperature_2m}°C, ${current.cloud_cover}% clouds, WMO ${current.weather_code})`);

      return weatherCondition;

    } catch (error) {
      console.error('Open-Meteo API error:', error.message);
      // Fallback to time-based estimation
      return this.estimateWeatherByTime();
    }
  }

  /**
   * Map Open-Meteo WMO Weather Codes to our ML categories
   * WMO Weather interpretation codes (WW): https://open-meteo.com/en/docs
   *
   * 0: Clear sky
   * 1-3: Mainly clear, partly cloudy, overcast
   * 45, 48: Fog
   * 51-67: Drizzle and rain
   * 71-77, 85-86: Snow
   * 80-82: Rain showers
   * 95-99: Thunderstorm
   */
  mapOpenMeteoCondition(current) {
    const code = current.weather_code;
    const rain = current.rain || 0;
    const cloudCover = current.cloud_cover || 0;

    // Thunderstorm (WMO 95-99)
    if (code >= 95) return 'stormy';

    // Heavy rain or rain showers (WMO 61-67, 80-82)
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rainy';

    // Light rain or drizzle (WMO 51-55)
    if (code >= 51 && code <= 55) return rain > 0.5 ? 'rainy' : 'cloudy';

    // Snow (treat as rainy for Sri Lanka - rare)
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'rainy';

    // Fog (WMO 45, 48)
    if (code === 45 || code === 48) return 'cloudy';

    // Cloudy (WMO 2-3)
    if (code === 2 || code === 3) return 'cloudy';

    // Partly cloudy (WMO 1)
    if (code === 1) return cloudCover > 50 ? 'cloudy' : 'sunny';

    // Clear sky (WMO 0)
    if (code === 0) return 'sunny';

    // Default based on cloud cover
    return cloudCover > 70 ? 'cloudy' : 'sunny';
  }

  /**
   * Estimate weather based on time patterns (fallback)
   * Sri Lanka monsoon patterns:
   * - May to September: Southwest monsoon (more rain)
   * - October to January: Northeast monsoon (more rain)
   * - Afternoon: Higher chance of rain (tropical pattern)
   */
  estimateWeatherByTime() {
    // Use Asia/Colombo timezone
    const now = new Date();

    // Get month in Colombo timezone
    const monthFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo',
      month: 'numeric'
    });
    const month = parseInt(monthFormatter.format(now)) - 1; // 0-11

    // Get hour in Colombo timezone
    const hourFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo',
      hour: 'numeric',
      hour12: false
    });
    const hour = parseInt(hourFormatter.format(now));

    const random = Math.random();

    // Monsoon seasons (higher rain probability)
    const isMonsoonSeason =
      (month >= 4 && month <= 8) ||  // May-Sep (SW monsoon)
      (month >= 9 && month <= 0);    // Oct-Jan (NE monsoon)

    // Afternoon rain pattern (2 PM - 5 PM)
    const isAfternoon = hour >= 14 && hour <= 17;

    // Calculate rain probability
    let rainChance = 0.2; // Base 20%
    if (isMonsoonSeason) rainChance += 0.3;
    if (isAfternoon) rainChance += 0.2;

    // Determine weather
    if (random < rainChance) {
      return random < rainChance / 2 ? 'rainy' : 'cloudy';
    }

    return hour >= 6 && hour <= 18 ? 'sunny' : 'cloudy';
  }

  /**
   * Get current crowd level estimation
   * Based on: day of week, time of day, academic calendar
   */
  getCurrentCrowdLevel() {
    // Use Asia/Colombo timezone
    const now = new Date();

    // Get hour in Colombo timezone
    const hourFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo',
      hour: 'numeric',
      hour12: false
    });
    const hour = parseInt(hourFormatter.format(now));

    // Get day of week in Colombo timezone
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo',
      weekday: 'short'
    });
    const dayName = dayFormatter.format(now);
    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dayName);

    // Weekend = low crowd
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 'low';
    }

    // Weekday patterns
    // Early morning (6-8 AM) = medium (people arriving)
    if (hour >= 6 && hour < 8) return 'medium';

    // Morning rush (8-9 AM) = very high (everyone arriving)
    if (hour >= 8 && hour < 9) return 'very_high';

    // Class time (9-11 AM) = medium (people in class)
    if (hour >= 9 && hour < 11) return 'medium';

    // Pre-lunch (11 AM-12 PM) = high (classes ending, heading to cafeteria)
    if (hour >= 11 && hour < 12) return 'high';

    // Lunch time (12-1 PM) = very high (cafeteria, library busy)
    if (hour >= 12 && hour < 13) return 'very_high';

    // Post-lunch (1-2 PM) = high (afternoon classes starting)
    if (hour >= 13 && hour < 14) return 'high';

    // Afternoon (2-4 PM) = medium (classes ongoing)
    if (hour >= 14 && hour < 16) return 'medium';

    // Evening rush (4-6 PM) = high (classes ending, leaving campus)
    if (hour >= 16 && hour < 18) return 'high';

    // Night (6 PM onwards) = low (most students gone)
    if (hour >= 18) return 'low';

    // Default
    return 'medium';
  }

  /**
   * Get detailed weather and crowd info for dashboard
   */
  async getDetailedConditions() {
    const weather = await this.getCurrentWeather();
    const crowd = this.getCurrentCrowdLevel();

    // Get cached weather details if available
    const cached = this.cache.data;

    return {
      weather,
      crowdLevel: crowd,
      timestamp: new Date(),
      source: cached ? 'Open-Meteo API' : 'estimated',
      location: 'SLIIT Malabe Campus',
      // Additional weather details from Open-Meteo
      temperature: cached?.temperature || null,
      humidity: cached?.humidity || null,
      precipitation: cached?.precipitation || null,
      cloudCover: cached?.cloudCover || null,
      windSpeed: cached?.windSpeed || null,
      weatherCode: cached?.weatherCode || null
    };
  }

  /**
   * Check if cache is still valid
   */
  isCacheValid() {
    if (!this.cache.data || !this.cache.timestamp) {
      return false;
    }
    return (Date.now() - this.cache.timestamp) < this.cache.ttl;
  }

  /**
   * Clear cache (force refresh)
   */
  clearCache() {
    this.cache.data = null;
    this.cache.timestamp = null;
  }
}

// Export singleton
module.exports = new WeatherService();