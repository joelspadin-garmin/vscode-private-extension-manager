// Quick and dirty tabs implementation.
// TODO: Consider replacing with something like
// https://www.webcomponents.org/element/HTMLElements/smart-tabs or
// https://github.com/reactjs/react-tabs.

function initTab(id: string, index: number) {
    const link = document.querySelector(`#tab-${id} > a`) as HTMLElement;
    const page = document.querySelector(`#${id}`) as HTMLElement;

    link.addEventListener('click', () => setTab(index));
    link.addEventListener('keypress', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            setTab(index);
        }
    });

    return { link, page };
}

function setTab(idx: number) {
    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];

        if (i === idx) {
            tab.link.classList.add('checked');
            tab.page.style.display = 'inherit';
        } else {
            tab.link.classList.remove('checked');
            tab.page.style.display = 'none';
        }
    }
}

const tabs = ['details', 'changelog'].map(initTab);

setTab(0);
