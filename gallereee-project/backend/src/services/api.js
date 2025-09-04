// src/services/api.js
import axios from "axios";

// Change this to your real backend endpoint
const BASE_URL = "http://localhost:5000/api";

export const galleryAPI = {
  getGalleries: () => axios.get(`${BASE_URL}/galleries`),
};
