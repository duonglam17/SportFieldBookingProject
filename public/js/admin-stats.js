const statsPageState = {
  revenueChart: null,
  hourChart: null,
};

const statusLabels = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  completed: 'Hoàn tất',
  no_show: 'Không đến',
  cancelled: 'Đã hủy',
};

function currentMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function setStatsMessage(message, isError = false) {
  const element = document.getElementById('stats-message');
  element.textContent = message;
  element.classList.toggle('form-message-error', isError);
  element.classList.toggle('form-message-success', !isError && Boolean(message));
}

function formatCurrency(amount) {
  return `${Number(amount).toLocaleString('vi-VN')}đ`;
}

function appendTableRow(body, label, value) {
  const row = document.createElement('tr');
  const nameCell = document.createElement('td');
  const valueCell = document.createElement('td');
  nameCell.textContent = String(label);
  valueCell.textContent = String(value);
  row.append(nameCell, valueCell);
  body.appendChild(row);
}

function renderTables(data) {
  const statusBody = document.getElementById('status-table-body');
  statusBody.replaceChildren();
  Object.entries(data.bookingsByStatus).forEach(([status, count]) => {
    appendTableRow(statusBody, statusLabels[status] || status, count);
  });

  const hoursBody = document.getElementById('popular-hours-body');
  hoursBody.replaceChildren();
  if (data.topTimeSlots.length === 0) {
    appendTableRow(hoursBody, 'Chưa có dữ liệu', '—');
  } else {
    data.topTimeSlots.forEach((slot) => {
      appendTableRow(hoursBody, `${slot.start}–${slot.end}`, slot.count);
    });
  }

  const fieldsBody = document.getElementById('fields-table-body');
  fieldsBody.replaceChildren();
  data.bookingsByField.forEach((field) => {
    appendTableRow(fieldsBody, field.fieldName, field.count);
  });
}

function renderCharts(data) {
  if (typeof window.Chart !== 'function') {
    throw new Error('Không tải được thư viện biểu đồ. Vui lòng kiểm tra kết nối mạng rồi thử lại.');
  }

  statsPageState.revenueChart?.destroy();
  statsPageState.hourChart?.destroy();
  statsPageState.revenueChart = new window.Chart(
    document.getElementById('revenue-chart'),
    {
      type: 'line',
      data: {
        labels: data.revenueByDay.map((item) => item.date.slice(-2)),
        datasets: [{
          label: 'Doanh thu',
          data: data.revenueByDay.map((item) => item.revenue),
          borderColor: '#176b52',
          backgroundColor: 'rgba(23, 107, 82, 0.15)',
          fill: true,
          tension: 0.25,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => `${Number(value).toLocaleString('vi-VN')}đ` },
          },
        },
      },
    },
  );
  statsPageState.hourChart = new window.Chart(
    document.getElementById('hour-chart'),
    {
      type: 'bar',
      data: {
        labels: data.bookingsByHour.map((item) => `${item.start}–${item.end}`),
        datasets: [{
          label: 'Lượt đặt',
          data: data.bookingsByHour.map((item) => item.count),
          backgroundColor: '#4b9b78',
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    },
  );
}

function renderStats(data) {
  document.getElementById('stats-revenue').textContent = formatCurrency(data.summary.totalRevenue);
  document.getElementById('stats-bookings').textContent =
    Number(data.summary.bookingCount).toLocaleString('vi-VN');
  document.getElementById('stats-no-show-count').textContent =
    Number(data.summary.noShowCount).toLocaleString('vi-VN');
  document.getElementById('stats-no-show-rate').textContent =
    `${(Number(data.summary.noShowRate) * 100).toLocaleString('vi-VN', {
      maximumFractionDigits: 1,
    })}%`;
  renderTables(data);
  renderCharts(data);
}

async function loadMonthlyStats(month) {
  setStatsMessage('Đang tải thống kê...');
  document.getElementById('stats-cards').setAttribute('aria-busy', 'true');
  try {
    const { data } = await apiFetch(`/api/admin/stats?month=${encodeURIComponent(month)}`);
    renderStats(data);
    setStatsMessage(`Đang hiển thị thống kê tháng ${data.month}.`);
  } finally {
    document.getElementById('stats-cards').removeAttribute('aria-busy');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const monthInput = document.getElementById('stats-month');
  monthInput.value = currentMonthValue();

  try {
    const { data } = await apiFetch('/api/auth/me');
    if (data.user.role !== 'admin') {
      window.redirectToAdminLogin();
      return;
    }
    await loadMonthlyStats(monthInput.value);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      window.redirectToAdminLogin();
      return;
    }
    setStatsMessage(error.message, true);
  }

  document.getElementById('stats-month-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    if (!monthInput.value) {
      setStatsMessage('Vui lòng chọn tháng thống kê.', true);
      return;
    }
    submit.disabled = true;
    try {
      await loadMonthlyStats(monthInput.value);
    } catch (error) {
      setStatsMessage(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });
});
