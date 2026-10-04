function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setHomeMessage(message, isError = false) {
  const element = document.getElementById('home-message');
  element.textContent = message;
  element.classList.toggle('form-message-error', isError);
  element.classList.toggle('form-message-success', !isError && Boolean(message));
}

async function loadSportTypes() {
  const select = document.getElementById('sport-type');
  const message = document.getElementById('home-message');
  const dateInput = document.getElementById('booking-date');

  dateInput.min = getLocalDateString();

  select.disabled = true;
  message.textContent = 'Đang tải danh sách môn thể thao...';
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
      setHomeMessage('Chưa có loại hình thể thao để đặt sân.', true);
    } else {
      select.disabled = false;
      setHomeMessage('');
    }
  } catch (error) {
    select.replaceChildren();
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Không tải được danh sách';
    select.appendChild(option);
    select.disabled = true;
    setHomeMessage(error.message, true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('schedule-search-form');
  const submit = form.querySelector('[type="submit"]');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const sportTypeId = formData.get('sportTypeId');
    const date = formData.get('date');

    if (!sportTypeId || !date || date < getLocalDateString()) {
      setHomeMessage('Chọn môn thể thao và ngày hôm nay hoặc một ngày trong tương lai.', true);
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Đang mở lịch...';
    const params = new URLSearchParams({ sportTypeId, date });
    window.location.assign(`/schedule.html?${params.toString()}`);
  });
  document.getElementById('booking-date').addEventListener('change', () => setHomeMessage(''));
  document.getElementById('sport-type').addEventListener('change', () => setHomeMessage(''));

  loadSportTypes();
});
