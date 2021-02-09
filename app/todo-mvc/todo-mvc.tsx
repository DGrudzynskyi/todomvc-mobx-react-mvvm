import * as React from 'react';
import { withVM } from '../lib/with-vm';
import { ITodoMvcVMProps, TodosVMContext, TodosVM } from './todo-mvc.vm';
import { Footer } from './_footer';
import { Header } from './_header';
import { TodoList } from './_todo-list/todo-list';


const TodoMvcDisconnected = (props: ITodoMvcVMProps & { vm: TodosVM }) => {
    return <TodosVMContext.Provider value={props.vm}>
        <section className="todoapp">
            <Header />
            <TodoList status={props.status} />
            <Footer selectedStatus={props.status} />
        </section>
    </TodosVMContext.Provider> 
};

const TodoMVC = withVM(TodoMvcDisconnected, TodosVM, 'vm');

export { TodoMVC }