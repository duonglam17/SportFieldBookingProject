const scheduleState = {
  config: null,
  sportTypeId: null,
  sportTypeName: '',
  date: '',
  fields: [],
  schedules: new Map(),
  selection: null,
  priceRequestId: 0,
};

function parseClock(value) {
  const match = typeof value === 'string' ? value.match(/^([01]\d|2[0-3]):([0-5]\d)/) : null;
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClock(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const remainder = String(minutes % 60).padStart(2, '0');
  return `${hours}:${remainder}`;
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isPastSlot(date, start) {
  if (date !== localDateString()) return false;
  const startMinutes = parseClock(start);
  if (startMinutes === null) return false;
  const now = new Date();
  return startMinutes <= now.getHours() * 60 + now.getMinutes();
}

function setScheduleMessage(message, isError = false) {
  const element = document.getElementById('schedule-message');
  element.textContent = message;
  element.classList.toggle('form-message-error', isError);
  element.classList.toggle('form-message-success', !isError && Boolean(message));
}

function findBusyInterval(fieldId, start, end) {
  const schedule = scheduleState.schedules.get(fieldId) || [];
  const startMinutes = parseClock(start);
  const endMinutes = parseClock(end);

  return schedule.find((interval) => {
    const busyStart = parseClock(interval.start);
    const busyEnd = parseClock(interval.end);
    return busyStart < endMinutes && busyEnd > startMinutes;
  });
}

function makeCell(tagName, text, className) {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function createGrid(hours) {
  const table = document.createElement('table');
  table.className = 'schedule-grid';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const fieldHeader = makeCell('th', 'Sân', 'schedule-field-heading');
  fieldHeader.scope = 'col';
  headerRow.appendChild(fieldHeader);

  hours.forEach((hour) => {
    const heading = makeCell('th', hour, 'schedule-hour-heading');
    heading.scope = 'col';
    headerRow.appendChild(heading);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  scheduleState.fields.forEach((field) => {
    const row = document.createElement('tr');
    const fieldCell = makeCell('th', field.name, 'schedule-field-name');
    fieldCell.scope = 'row';
    row.appendChild(fieldCell);

    hours.slice(0, -1).forEach((start, index) => {
      const end = hours[index + 1];
      const cell = document.createElement('td');
      const button = document.createElement('button');
      const busy = findBusyInterval(field.id, start, end);
      const past = isPastSlot(scheduleState.date, start);
      const type = busy ? busy.type : 'free';

      button.type = 'button';
      button.className = `schedule-slot slot-${type}${past ? ' slot-past' : ''}`;
      button.dataset.fieldId = String(field.id);
      button.dataset.index = String(index);
      button.dataset.start = start;
      button.dataset.end = end;
      button.setAttribute('aria-label', `${field.name}, ${start}-${end}, ${slotLabel(type, past)}`);
      button.textContent = busy ? (busy.type === 'booked' ? 'Đã đặt' : 'Bị khóa') : `${start}`;
      button.disabled = Boolean(busy) || past;
      button.title = `${start}-${end}: ${slotLabel(type, past)}`;
      cell.appendChild(button);
      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  return table;
}

function slotLabel(type, past) {
  if (past) return 'đã qua';
  if (type === 'booked') return 'đã đặt';
  if (type === 'blocked') return 'bị khóa';
  return 'còn trống';
}

function updateSelectedSlotStyles() {
  document.querySelectorAll('.schedule-slot').forEach((button) => {
    const selected =
      scheduleState.selection &&
      Number(button.dataset.fieldId) === scheduleState.selection.fieldId &&
      Number(button.dataset.index) >= scheduleState.selection.startIndex &&
      Number(button.dataset.index) < scheduleState.selection.endIndex;
    button.classList.toggle('slot-selected', Boolean(selected));
  });
}

function selectRange(button) {
  const fieldId = Number(button.dataset.fieldId);
  const index = Number(button.dataset.index);

  if (!scheduleState.selection || scheduleState.selection.fieldId !== fieldId) {
    scheduleState.selection = { fieldId, startIndex: index, endIndex: index + 1 };
    renderSelection();
    return;
  }

  if (
    index >= scheduleState.selection.startIndex &&
    index < scheduleState.selection.endIndex
  ) {
    scheduleState.selection = { fieldId, startIndex: index, endIndex: index + 1 };
    renderSelection();
    return;
  }

  const anchor = scheduleState.selection.startIndex;
  const startIndex = Math.min(anchor, index);
  const endIndex = Math.max(anchor, index) + 1;
  const maxHours = scheduleState.config.maxHoursPerBooking;

  if (endIndex - startIndex > maxHours) {
    setScheduleMessage(`Bạn chỉ có thể chọn tối đa ${maxHours} giờ liên tiếp.`, true);
    return;
  }

  const starts = Array.from(document.querySelectorAll('.schedule-slot'))
    .filter(
      (slot) =>
        Number(slot.dataset.fieldId) === fieldId &&
        Number(slot.dataset.index) >= startIndex &&
        Number(slot.dataset.index) < endIndex,
    )
    .sort((first, second) => Number(first.dataset.index) - Number(second.dataset.index));

  if (
    starts.length !== endIndex - startIndex ||
    starts.some((slot) => slot.disabled || slot.classList.contains('slot-past'))
  ) {
    setScheduleMessage('Khoảng giờ phải liên tục và chỉ gồm các ô còn trống.', true);
    return;
  }

  scheduleState.selection = { fieldId, startIndex, endIndex };
  setScheduleMessage('');
  renderSelection();
}

function renderSelection() {
  updateSelectedSlotStyles();
  const bar = document.getElementById('selection-bar');
  const summary = document.getElementById('selection-summary');
  const price = document.getElementById('selection-price');
  const breakdown = document.getElementById('selection-breakdown');

  if (!scheduleState.selection) {
    bar.hidden = true;
    return;
  }

  const selectedField = scheduleState.fields.find(
    (field) => field.id === scheduleState.selection.fieldId,
  );
  const hours = createHourList();
  const start = hours[scheduleState.selection.startIndex];
  const end = hours[scheduleState.selection.endIndex];
  if (!selectedField || !start || !end) {
    scheduleState.selection = null;
    bar.hidden = true;
    return;
  }

  summary.textContent = `${selectedField.name}: ${start}–${end}`;
  price.textContent = 'Đang cập nhật báo giá...';
  breakdown.textContent = '';
  bar.hidden = false;
  loadPrice(selectedField, start, end, price, breakdown);
}

function createHourList() {
  const openMinutes = parseClock(scheduleState.config.openTime);
  const closeMinutes = parseClock(scheduleState.config.closeTime);
  const hours = [];

  for (let minutes = openMinutes; minutes <= closeMinutes; minutes += 60) {
    hours.push(formatClock(minutes));
  }

  return hours;
}

async function loadPrice(field, start, end, priceElement, breakdownElement) {
  const requestId = ++scheduleState.priceRequestId;
  const params = new URLSearchParams({
    sportTypeId: String(field.sport_type_id),
    date: scheduleState.date,
    start,
    end,
  });

  try {
    const { data } = await apiFetch(`/api/price?${params.toString()}`);
    if (requestId !== scheduleState.priceRequestId || !scheduleState.selection) return;

    const amount = Number(data?.totalPrice ?? data?.price ?? data?.amount);

    if (Number.isFinite(amount) && amount >= 0) {
      priceElement.textContent = `Tổng tiền: ${amount.toLocaleString('vi-VN')}đ`;
      if (Number.isFinite(Number(data.depositAmount))) {
        priceElement.textContent += ` · Tiền cọc: ${Number(data.depositAmount).toLocaleString('vi-VN')}đ`;
      }
      breakdownElement.textContent = Array.isArray(data.breakdown)
        ? data.breakdown
            .map(
              (slot) =>
                `${slot.start}–${slot.end}: ${Number(slot.totalPrice).toLocaleString('vi-VN')}đ`,
            )
            .join(' · ')
        : '';
    } else {
      priceElement.textContent = 'Giá đang cập nhật.';
    }
  } catch (error) {
    if (requestId !== scheduleState.priceRequestId) return;
    priceElement.textContent =
      error.status === 404 ? 'Giá đang cập nhật.' : `Chưa tải được báo giá: ${error.message}`;
  }
}

async function loadSchedule() {
  const params = new URLSearchParams(window.location.search);
  const sportTypeIdText = params.get('sportTypeId');
  const date = params.get('date');

  if (!sportTypeIdText || !/^[1-9]\d*$/.test(sportTypeIdText) || !date) {
    window.location.replace('/');
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < localDateString()) {
    setScheduleMessage('Không thể xem lịch của ngày đã qua hoặc ngày không hợp lệ.', true);
    document.getElementById('schedule-grid-container').replaceChildren(
      makeCell('p', 'Chọn hôm nay hoặc một ngày trong tương lai.', 'form-message-error'),
    );
    return;
  }

  scheduleState.sportTypeId = Number(sportTypeIdText);
  scheduleState.date = date;
  document.getElementById('schedule-date-label').textContent = date;

  try {
    const [configResponse, sportTypesResponse, fieldsResponse] = await Promise.all([
      apiFetch('/api/config'),
      apiFetch('/api/sport-types'),
      apiFetch(`/api/fields?sportTypeId=${encodeURIComponent(sportTypeIdText)}`),
    ]);

    scheduleState.config = configResponse.data;
    scheduleState.fields = fieldsResponse.data;
    scheduleState.sportTypeName =
      sportTypesResponse.data.find((item) => item.id === scheduleState.sportTypeId)?.name ||
      'Lịch sân';
    document.getElementById('schedule-title').textContent = `Lịch ${scheduleState.sportTypeName}`;

    const openMinutes = parseClock(scheduleState.config.openTime);
    const closeMinutes = parseClock(scheduleState.config.closeTime);
    const maxHours = Number(scheduleState.config.maxHoursPerBooking);
    if (
      openMinutes === null ||
      closeMinutes === null ||
      closeMinutes <= openMinutes ||
      (closeMinutes - openMinutes) % 60 !== 0 ||
      !Number.isInteger(maxHours) ||
      maxHours <= 0
    ) {
      throw new Error('Cấu hình giờ mở cửa hoặc giới hạn đặt sân không hợp lệ.');
    }

    const scheduleResponses = await Promise.all(
      scheduleState.fields.map((field) =>
        apiFetch(
          `/api/fields/${encodeURIComponent(field.id)}/schedule?date=${encodeURIComponent(date)}`,
        ),
      ),
    );
    scheduleState.fields.forEach((field, index) => {
      scheduleState.schedules.set(field.id, scheduleResponses[index].data);
    });

    const container = document.getElementById('schedule-grid-container');
    container.replaceChildren();
    if (scheduleState.fields.length === 0) {
      container.appendChild(makeCell('p', 'Chưa có sân đang hoạt động cho môn này.', 'muted'));
      return;
    }

    container.appendChild(createGrid(createHourList()));
    container.addEventListener('click', (event) => {
      const button = event.target.closest('.schedule-slot');
      if (button && !button.disabled) selectRange(button);
    });
  } catch (error) {
    setScheduleMessage(error.message, true);
    const container = document.getElementById('schedule-grid-container');
    container.replaceChildren(makeCell('p', error.message, 'form-message-error'));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSchedule();
  document.getElementById('book-selected').addEventListener('click', async () => {
    if (!scheduleState.selection) return;

    const field = scheduleState.fields.find(
      (item) => item.id === scheduleState.selection.fieldId,
    );
    const hours = createHourList();
    const bookingParams = new URLSearchParams({
      fieldId: String(field.id),
      sportTypeId: String(field.sport_type_id),
      date: scheduleState.date,
      start: hours[scheduleState.selection.startIndex],
      end: hours[scheduleState.selection.endIndex],
    });
    const bookingUrl = `/booking.html?${bookingParams.toString()}`;

    try {
      await apiFetch('/api/auth/me');
      window.location.assign(bookingUrl);
    } catch (error) {
      if (error.status === 401) {
        window.location.assign(`/login.html?next=${encodeURIComponent(bookingUrl)}`);
        return;
      }
      setScheduleMessage(error.message, true);
    }
  });
});
