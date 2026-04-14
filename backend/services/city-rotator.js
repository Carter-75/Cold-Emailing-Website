const US_CITIES = [
  "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX", "Phoenix, AZ",
  "Philadelphia, PA", "San Antonio, TX", "San Diego, CA", "Dallas, TX", "San Jose, CA",
  "Austin, TX", "Jacksonville, FL", "Fort Worth, TX", "Columbus, OH", "Indianapolis, IN",
  "Charlotte, NC", "San Francisco, CA", "Seattle, WA", "Denver, CO", "Oklahoma City, OK",
  "Nashville, TN", "El Paso, TX", "Washington, DC", "Las Vegas, NV", "Boston, MA",
  "Portland, OR", "Louisville, KY", "Memphis, TN", "Detroit, MI", "Baltimore, MD",
  "Milwaukee, WI", "Albuquerque, NM", "Tucson, AZ", "Fresno, CA", "Sacramento, CA",
  "Mesa, AZ", "Kansas City, MO", "Atlanta, GA", "Long Beach, CA", "Omaha, NE",
  "Raleigh, NC", "Colorado Springs, CO", "Virginia Beach, VA", "Miami, FL", "Oakland, CA",
  "Minneapolis, MN", "Tulsa, OK", "Bakersfield, CA", "Wichita, KS", "Arlington, TX"
];

class CityRotator {
  constructor() {
    this.currentIndex = 0;
  }

  getNextCity() {
    const city = US_CITIES[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % US_CITIES.length;
    return city;
  }
}

module.exports = new CityRotator();
