function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function loadSportTypes() {
  const select = document.getElementById('sport-type');
  const message = document.getElementById('home-message');
  const dateInput = document.getElementById('booking-date');

  dateInput.min = getLocalDateString();

  try {
    const { data: sportTypes } = await apiFetch('/api/sport-types');
    select.replaceChildren();

    sportTypes.forEach((sportType) => {
      const option = document.createElement('option');
      option.value = String(sportType.id);
      option.textContent = sportType.name;
      select.appendChild(option);
    });

    if (sportTypes.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Chưa có loại hình thể thao';
      select.appendChild(option);
      select.disabled = true;
    }
  } catch (error) {
    select.replaceChildren();
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Không tải được danh sách';
    select.appendChild(option);
    select.disabled = true;
    message.textContent = error.message;
    message.classList.add('form-message-error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('schedule-search-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const sportTypeId = formData.get('sportTypeId');
    const date = formData.get('date');

    if (!sportTypeId || !date || date < getLocalDateString()) {
      const message = document.getElementById('home-message');
      message.textContent = 'Chọn môn thể thao và ngày hôm nay hoặc một ngày trong tương lai.';
      message.classList.add('form-message-error');
      return;
    }

    const params = new URLSearchParams({ sportTypeId, date });
    window.location.assign(`/schedule.html?${params.toString()}`);
  });

  loadSportTypes();
});
