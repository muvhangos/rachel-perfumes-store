// Client-side logic: posts order to server, requests reverse geocoding and payment session
async function reverseGeocodeCoords(lat, lng) {
  try {
    const res = await fetch('/api/reverse-geocode?lat=' + lat + '&lng=' + lng);
    if (!res.ok) throw new Error('Reverse geocode failed');
    const data = await res.json();
    return data.address || `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
  } catch (e) {
    return `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
  }
}

window.addEventListener('load', () => {
  const useBtn = document.getElementById('useLocation');
  useBtn.addEventListener('click', async () => {
    if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
    useBtn.textContent = 'Detecting...';
    navigator.geolocation.getCurrentPosition(async (pos) => {
      useBtn.textContent = 'Use my location';
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const addr = await reverseGeocodeCoords(lat, lng);
      document.getElementById('deliveryAddress').value = addr;
    }, (err) => {
      useBtn.textContent = 'Use my location';
      alert('Unable to get location. Allow location access or type address.');
    });
  });

  document.getElementById('placeOrder').addEventListener('click', async () => {
    const numPerfumes = parseInt(document.getElementById('numPerfumes').value, 10);
    const perfumeType = document.getElementById('perfumeType').value;
    const flavour = document.getElementById('flavour').value;
    const address = document.getElementById('deliveryAddress').value.trim();
    const birthday = document.getElementById('birthday').value;
    if (!numPerfumes || numPerfumes <= 0) { alert('Enter quantity (>=1)'); return; }
    if (!address) { alert('Provide delivery address'); return; }

    const loading = document.getElementById('loading');
    loading.style.display = 'block';

    const pricePer = 450;
    let total = numPerfumes * pricePer;
    const discount = birthday === 'yes' ? 0.1 : 0;
    if (discount) total = Math.round(total * (1 - discount));

    // Create order on server
    const payload = { numPerfumes, perfumeType, flavour, address, birthday, total };
    const res = await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await res.json();
    loading.style.display = 'none';
    if (!res.ok) {
      alert('Failed to place order: ' + (result.error || res.statusText));
      return;
    }

    // Show summary and offer to pay (if stripe session created)
    const summary = document.getElementById('displayTotal');
    summary.innerHTML = `
      <h3>Order Summary</h3>
      <p><strong>Perfume:</strong> ${perfumeType}</p>
      <p><strong>Fragrance:</strong> ${flavour}</p>
      <p><strong>Quantity:</strong> ${numPerfumes}</p>
      <p><strong>Delivery Address:</strong> ${address}</p>
      <p><strong>Total Price:</strong> R${total.toFixed(2)}</p>
      <p>${discount ? '🎉 Birthday discount applied!' : ''}</p>
    `;

    if (result.checkoutUrl) {
      const payBtn = document.createElement('button');
      payBtn.textContent = 'Pay now';
      payBtn.addEventListener('click', () => { window.location = result.checkoutUrl; });
      summary.appendChild(payBtn);
    } else {
      const note = document.createElement('p');
      note.innerHTML = '<em>Payment not enabled. Configure STRIPE_SECRET_KEY on the server to enable payments.</em>';
      summary.appendChild(note);
    }
  });
});
