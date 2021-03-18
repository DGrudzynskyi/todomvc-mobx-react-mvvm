<script lang="ts">
    import { connectTodosVM } from './todo-mvc.vm';

    let createTodo: (name: string) => void;

    connectTodosVM((vm) => {
        createTodo = vm.createTodo;
    })
    
    const handleBlur = (e: FocusEvent) => {
        (e.currentTarget as HTMLInputElement).value = '';
    }

    const handleClick = (e: KeyboardEvent) => {
        const target = (e.currentTarget as HTMLInputElement);

        if(e.key === 'Enter') {
            const value = target.value;
            target.value = '';
            createTodo(value);
        }
        if(e.key === 'Escape') {
            target.value = '';
        }
    }

</script>

<header class="header">
    <h1>todos</h1>
    <input 
        class="new-todo" 
        placeholder="What needs to be done?" 
        autofocus 
        on:keydown={handleClick} 
        on:blur={handleBlur} 
    />
</header>