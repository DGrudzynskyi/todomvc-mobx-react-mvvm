# todomvc-mobx-react-mvvm

Implementation of TodoMVC application, built as an illustration to <a href='https://dgrudzynskyi.github.io/dev-blog/architecture/2021/03/04/designing-framework-agnostic-browser-based-spa.html'>article about building framework-agnostic SPA</a>.
Example is hosted at https://dgrudzynskyi.github.io/todomvc-mobx-react-mvvm/

This repository might also be considered as an example of code structure while using react for UI rendering and mobx for state management.

In order to launch locally, run these commands from the root folder of this repository:
```
npm install
npm run build
npm start
```

Local application port is hardcoded within the local-server.js file.

Application sources are located within the 'app' folder.

- app/framework-extensions - code, related to integration with react and mobx
- app/boundaries - code, related to integration with external boundaries (so far - only local storage)
- app/todo-mvc - application itself.
- app/entry.tsx - Notice it's dependency on react

Checkout the <a href='https://dgrudzynskyi.github.io/dev-blog/architecture/2021/03/04/designing-framework-agnostic-browser-based-spa.html'>article</a> for more details.
