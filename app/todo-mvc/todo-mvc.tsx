import * as React from 'react';
import { withVM } from '../infrastructure-utils/with-vm';
import { TodosVM } from './todo-mvc.vm';
import { TodoStatus } from './todos.dao';
import { Footer } from './_footer';
import { Header } from './_header';
import { TodoList } from './_todo-list/todo-list';

const TodoMvcDisconnected = (props: { status: TodoStatus }) => {
    return <section className="todoapp">
        <Header />
        <TodoList status={props.status} />
        <Footer selectedStatus={props.status} />
    </section>
};

const TodoMVC = withVM(TodoMvcDisconnected, TodosVM);

export { TodoMVC }