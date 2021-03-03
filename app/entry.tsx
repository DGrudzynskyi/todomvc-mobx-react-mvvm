import * as React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter, Route } from 'react-router-dom';
import { TodoMVC } from './todo-mvc/todo-mvc';

const basePath = process.env.basePath;

ReactDOM.render(
    <React.StrictMode>
        {/* use string for simplicity. in real life application should be extracted into runtime settings  */}
        <BrowserRouter basename={basePath}>
            <Route 
                path="/:todostatus?"
                render={({ match }) => {
                    return <>
                        <TodoMVC status={match.params.todostatus} />
                    </>;
                  }}>
            </Route>
            
            <footer className="info">
                <p>Double-click to edit a todo</p>
                <p>Created by <a href="http://todomvc.com">Dani Jug</a></p>
                <p>Part of <a href="http://todomvc.com">TodoMVC</a></p>
            </footer>
        </BrowserRouter>
    </React.StrictMode>,
    document.getElementById('todomvc-root')
);