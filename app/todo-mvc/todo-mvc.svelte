

<script lang="ts">
    import { withVM } from '../framework-extensions/with-vm';
    import { TodosVM } from './todo-mvc.vm';
    import { TodoStatus } from './todos.dao';
    import Header from './_header.svelte';
    import Footer from './_footer.svelte';
    import TodoList from './_todo-list/todo-list.svelte';

    export let status: TodoStatus;

    withVM(
        TodosVM, 
        () => { 
            return {
                status: status,
            };
        });

</script>

<section class="todoapp">
    <Header />
    <TodoList status={status} />
    <Footer selectedStatus={status} />
</section>