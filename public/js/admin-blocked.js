const blockedState = {
  fields: [],
  config: null,
};

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseClock(value) {
  const match = typeof value === 'string' ? value.match(/^([01]\d|2[0-3]):([0-5]\d)/) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function clockText(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function setBlockedMessage(message, isError = false) {
  const element = document.getElementById('blocked-message');
  element.textContent = message;
  element.classList.toggle('form-message-error', isError);
  element.classList.toggle('form-message-success', !isError && Boolean(message));
}

function appendLabel(container, label, value) {
  const line = document.createElement('p');
  const heading = document.createElement('strong');
  heading.textContent = `${label}: `;
  line.append(heading, document.createTextNode(String(value)));
  container.appendChild(line);
}

function renderConflicts(conflicts) {
  const container = document.getElementById('booking-conflicts');
  container.replaceChildren();
  container.hidden = conflicts.length === 0;
  if (!conflicts.length) return;

  const title = document.createElement('h3');
  title.textContent = 'Các lượt đặt cần xử lý trước khi khóa:';
  container.appendChild(title);
  const list = document.createElement('ul');
  conflicts.forEach((booking) => {
    const item = document.createElement('li');
    item.textContent = `#${booking.bookingId} · ${booking.customerName} · ${booking.status} · ${booking.date} ${booking.start}-${booking.end}`;
    list.appendChild(item);
  });
  container.appendChild(list);
}

async function loadFields() {
  const [{ data: fields }, { data: config }] = await Promise.all([
    apiFetch('/api/admin/blocked-slots/fields'),
    apiFetch('/api/config'),
  ]);
  blockedState.fields = fields;
  blockedState.config = config;

  const select = document.getElementById('blocked-field');
  select.replaceChildren();
  fields.forEach((field) => {
    const option = document.createElement('option');
    option.value = String(field.id);
    option.textContent = `${field.name} (${field.status})`;
    select.appendChild(option);
  });

  const dateInput = document.getElementById('blocked-date');
  dateInput.min = localDateString();
  dateInput.value = localDateString();
  document.getElementById('blocked-list-date').value = '';
  document.getElementById('schedule-date').min = localDateString();
  document.getElementById('schedule-date').value = localDateString();
  await Promise.all([loadBlockedList(), loadDailySchedule()]);
}

function createBlockedCard(slot) {
  const card = document.createElement('article');
  card.className = 'booking-card-item';
  const title = document.createElement('h3');
  title.textContent = slot.fieldName;
  card.appendChild(title);
  appendLabel(card, 'Ngày giờ', `${slot.date} · ${slot.start}–${slot.end}`);
  if (slot.reason) appendLabel(card, 'Lý do', slot.reason);
  if (slot.creatorName) appendLabel(card, 'Người tạo', slot.creatorName);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button button-secondary';
  remove.textContent = 'Xóa khóa';
  remove.addEventListener('click', async () => {
    if (!window.confirm(`Xóa khóa sân ${slot.fieldName} ${slot.date} ${slot.start}-${slot.end}?`)) {
      return;
    }
    remove.disabled = true;
    try {
      const { data } = await apiFetch(`/api/admin/blocked-slots/${slot.id}`, {
        method: 'DELETE',
      });
      setBlockedMessage(data.message);
      await Promise.all([loadBlockedList(), loadDailySchedule()]);
    } catch (error) {
      setBlockedMessage(error.message, true);
      remove.disabled = false;
    }
  });
  card.appendChild(remove);
  return card;
}

async function loadBlockedList() {
  const date = document.getElementById('blocked-list-date').value;
  const container = document.getElementById('blocked-list');
  container.setAttribute('aria-busy', 'true');
  container.textContent = 'Đang tải danh sách khóa sân...';
  try {
    const query = new URLSearchParams();
    if (date) query.set('date', date);
    const suffix = query.size ? `?${query.toString()}` : '';
    const { data: blockedSlots } = await apiFetch(`/api/admin/blocked-slots${suffix}`);
    container.replaceChildren();
    if (blockedSlots.length === 0) {
      container.textContent = 'Không có khung giờ khóa sắp tới.';
      return;
    }
    blockedSlots.forEach((slot) => container.appendChild(createBlockedCard(slot)));
  } catch (error) {
    container.textContent = 'Không tải được danh sách khóa sân.';
    throw error;
  } finally {
    container.removeAttribute('aria-busy');
  }
}

function buildDailyGrid(fields, intervals, date) {
  const open = parseClock(blockedState.config.openTime);
  const close = parseClock(blockedState.config.closeTime);
  if (open === null || close === null || close <= open || (close - open) % 60 !== 0) {
    throw new Error('Cấu hình giờ mở cửa không hợp lệ.');
  }

  const hours = [];
  for (let minute = open; minute <= close; minute += 60) hours.push(clockText(minute));
  const table = document.createElement('table');
  table.className = 'schedule-grid';
  const head = document.createElement('thead');
  const headingRow = document.createElement('tr');
  const fieldHeader = document.createElement('th');
  fieldHeader.className = 'schedule-field-heading';
  fieldHeader.scope = 'col';
  fieldHeader.textContent = 'Sân';
  headingRow.appendChild(fieldHeader);

  hours.forEach((hour) => {
    const th = document.createElement('th');
    th.className = 'schedule-hour-heading';
    th.scope = 'col';
    th.textContent = hour;
    headingRow.appendChild(th);
  });
  head.appendChild(headingRow);
  table.appendChild(head);

  const body = document.createElement('tbody');
  fields.forEach((field) => {
    const row = document.createElement('tr');
    const fieldName = document.createElement('th');
    fieldName.className = 'schedule-field-name';
    fieldName.scope = 'row';
    fieldName.textContent = field.name;
    row.appendChild(fieldName);

    hours.slice(0, -1).forEach((start, index) => {
      const end = hours[index + 1];
      const startMinute = parseClock(start);
      const endMinute = parseClock(end);
      const interval = intervals.find((item) => {
        if (item.fieldId !== field.id) return false;
        return parseClock(item.start) < endMinute && parseClock(item.end) > startMinute;
      });
      const cell = document.createElement('td');
      const status = interval?.type || (field.status === 'maintenance' ? 'maintenance' : 'free');
      const slot = document.createElement('div');
      slot.className = `admin-schedule-slot slot-${status}`;
      slot.title = `${start}-${end}`;
      if (interval?.type === 'booked') {
        slot.textContent = interval.customerName || 'Đã đặt';
      } else if (interval?.type === 'blocked') {
        slot.textContent = interval.reason || 'Đã khóa';
      } else if (status === 'maintenance') {
        slot.textContent = 'Bảo trì';
      } else {
        slot.textContent = 'Trống';
      }
      cell.appendChild(slot);
      row.appendChild(cell);
    });

    body.appendChild(row);
  });
  table.appendChild(body);
  return table;
}

async function loadDailySchedule() {
  const date = document.getElementById('schedule-date').value;
  if (!date) return;
  const container = document.getElementById('daily-schedule');
  container.setAttribute('aria-busy', 'true');
  container.textContent = 'Đang tải lịch tổng...';
  try {
    const { data } = await apiFetch(
      `/api/admin/blocked-slots/schedule?date=${encodeURIComponent(date)}`,
    );
    container.replaceChildren(buildDailyGrid(data.fields, data.intervals, date));
  } catch (error) {
    container.textContent = 'Không tải được lịch tổng.';
    throw error;
  } finally {
    container.removeAttribute('aria-busy');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { data } = await apiFetch('/api/auth/me');
    if (!['staff', 'admin'].includes(data.user.role)) {
      window.location.replace('/login.html');
      return;
    }

    await loadFields();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      window.location.replace('/login.html');
      return;
    }
    setBlockedMessage(error.message, true);
  }

  document.getElementById('blocked-list-date').addEventListener('change', () => {
    loadBlockedList().catch((error) => setBlockedMessage(error.message, true));
  });
  document.getElementById('schedule-date').addEventListener('change', () => {
    loadDailySchedule().catch((error) => setBlockedMessage(error.message, true));
  });

  document.getElementById('blocked-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Đang xử lý...';
    const formData = new FormData(form);
    try {
      const { data } = await apiFetch('/api/admin/blocked-slots', {
        method: 'POST',
        body: JSON.stringify({
          fieldId: Number(formData.get('fieldId')),
          date: formData.get('date'),
          start: formData.get('start'),
          end: formData.get('end'),
          reason: formData.get('reason'),
        }),
      });
      renderConflicts([]);
      setBlockedMessage(`Đã khóa ${data.fieldName}, ${data.date} ${data.start}-${data.end}.`);
      await Promise.all([loadBlockedList(), loadDailySchedule()]);
    } catch (error) {
      renderConflicts(error.data?.conflicts || []);
      setBlockedMessage(error.message, true);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Tạo khóa sân';
    }
  });
});
