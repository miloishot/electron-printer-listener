window.onload = async () => {
  const response = await fetch('http://localhost:3000/api/devices');
  const devices = await response.json();
  const listDiv = document.getElementById('device-list');
  listDiv.innerHTML = `<pre>${JSON.stringify(devices, null, 2)}</pre>`;
};
