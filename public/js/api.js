async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error('Máy chủ trả về dữ liệu không hợp lệ.');
  }

  if (!response.ok || payload.ok === false) {
    const message =
      typeof payload.error === 'string' ? payload.error : 'Không thể xử lý yêu cầu.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function renderNavigation() {
  const header = document.createElement('header');
  header.className = 'site-header';

  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Điều hướng chính');

  const brand = document.createElement('a');
  brand.className = 'site-brand';
  brand.href = '/';
  brand.textContent = 'Sport Booking';
  nav.append(brand);

  const links = document.createElement('div');
  links.className = 'site-nav-links';
  nav.append(links);
  header.append(nav);
  document.body.prepend(header);

  apiFetch('/api/auth/me')
    .then(({ data }) => {
      const user = data.user;
      const greeting = document.createElement('span');
      greeting.className = 'nav-user';
      greeting.textContent = user.fullName;
      links.append(greeting);

      if (user.role === 'staff' || user.role === 'admin') {
        const adminLink = document.createElement('a');
        adminLink.href = '/admin/dashboard.html';
        adminLink.textContent = 'Quản lý';
        links.append(adminLink);
      }

      const logoutButton = document.createElement('button');
      logoutButton.className = 'button button-link';
      logoutButton.type = 'button';
      logoutButton.textContent = 'Đăng xuất';
      logoutButton.addEventListener('click', async () => {
        try {
          await apiFetch('/api/auth/logout', { method: 'POST' });
          window.location.assign('/login.html');
        } catch (error) {
          window.alert(error.message);
        }
      });
      links.append(logoutButton);
    })
    .catch((error) => {
      if (error.status !== 401) {
        const status = document.createElement('span');
        status.className = 'form-message-error';
        status.textContent = 'Không tải được trạng thái đăng nhập.';
        links.append(status);
        return;
      }

      const loginLink = document.createElement('a');
      loginLink.href = '/login.html';
      loginLink.textContent = 'Đăng nhập';

      const registerLink = document.createElement('a');
      registerLink.href = '/register.html';
      registerLink.textContent = 'Đăng ký';

      links.append(loginLink, registerLink);
    });
}

function showFormMessage(element, message, isError = true) {
  element.textContent = message;
  element.classList.toggle('form-message-error', isError);
  element.classList.toggle('form-message-success', !isError);
}

function initializeAuthForms() {
  const loginForm = document.querySelector('#login-form');
  const registerForm = document.querySelector('#register-form');

  if (loginForm) {
    const message = loginForm.querySelector('.form-message');
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);

      try {
        await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: formData.get('email'),
            password: formData.get('password'),
          }),
        });
        window.location.assign('/');
      } catch (error) {
        showFormMessage(message, error.message);
      }
    });
  }

  if (registerForm) {
    const message = registerForm.querySelector('.form-message');
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);

      try {
        await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            fullName: formData.get('fullName'),
            email: formData.get('email'),
            password: formData.get('password'),
          }),
        });
        showFormMessage(message, 'Đăng ký thành công. Bạn có thể đăng nhập.', false);
        registerForm.reset();
      } catch (error) {
        showFormMessage(message, error.message);
      }
    });
  }
}

window.apiFetch = apiFetch;

document.addEventListener('DOMContentLoaded', () => {
  renderNavigation();
  initializeAuthForms();
});