import * as React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter, Route } from 'react-router-dom';
import { TodoMVC } from './todo-mvc/todo-mvc';
import { TodoStatus } from './todo-mvc/todos.dao';

ReactDOM.render(
    <React.StrictMode>
        <BrowserRouter>
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