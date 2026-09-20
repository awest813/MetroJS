/**
 * Save / load / new city controls plus an in-chrome confirm for new city
 * (no blocking `window.confirm`).
 */
export class CityMenu {
  constructor(
    container: HTMLElement,
    handlers: {
      onSave: () => void;
      onLoad: () => void;
      onNewCity: () => void;
    },
  ) {
    container.innerHTML = '';
    container.classList.add('rail-group');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'City file');

    const heading = document.createElement('div');
    heading.className = 'rail-label';
    heading.textContent = 'City';
    container.appendChild(heading);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.id = 'save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.title = 'Save city to this browser';
    saveBtn.addEventListener('click', () => handlers.onSave());
    container.appendChild(saveBtn);

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.id = 'load-btn';
    loadBtn.textContent = 'Load';
    loadBtn.title = 'Load the last save';
    loadBtn.addEventListener('click', () => handlers.onLoad());
    container.appendChild(loadBtn);

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.id = 'new-city-btn';
    newBtn.textContent = 'New';
    newBtn.title = 'Abandon this city and generate a new map';
    container.appendChild(newBtn);

    const confirm = document.createElement('div');
    confirm.className = 'rail-confirm';
    confirm.hidden = true;
    confirm.innerHTML = `
      <p>Start a new city? Unsaved progress is lost.</p>
      <div class="rail-confirm-actions">
        <button type="button" class="confirm-ok">New city</button>
        <button type="button" class="confirm-cancel">Cancel</button>
      </div>
    `;
    container.appendChild(confirm);

    newBtn.addEventListener('click', () => {
      confirm.hidden = false;
      newBtn.disabled = true;
    });
    confirm.querySelector('.confirm-cancel')!.addEventListener('click', () => {
      confirm.hidden = true;
      newBtn.disabled = false;
    });
    confirm.querySelector('.confirm-ok')!.addEventListener('click', () => {
      handlers.onNewCity();
    });
  }
}
